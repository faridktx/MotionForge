using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace MotionForge.Unity.Editor
{
    internal static class MotionForgeBundleImporter
    {
        private const string ImportRootFolder = "Assets/MotionForgeImports";
        private const float DefaultFps = 30f;

        private sealed class TakeRange
        {
            public string Id = "";
            public string Name = "";
            public float StartTime;
            public float EndTime;
        }

        public static MotionForgeImportResult Import(string zipPath, MotionForgeImportOptions options)
        {
            var warnings = new List<string>();
            var result = new MotionForgeImportResult();
            GameObject sceneRoot = null;
            try
            {
                if (string.IsNullOrWhiteSpace(zipPath) || !File.Exists(zipPath))
                {
                    return Fail("Bundle file was not found.", warnings);
                }

                var fileName = Path.GetFileName(zipPath);
                var bundleName = Path.GetFileNameWithoutExtension(zipPath);
                var importFolderRel = BuildImportFolder(bundleName);
                var importFolderAbs = ToAbsoluteProjectPath(importFolderRel);

                Directory.CreateDirectory(importFolderAbs);
                ExtractZipSafely(zipPath, importFolderAbs);
                AssetDatabase.Refresh();

                var projectJsonPath = Directory.GetFiles(importFolderAbs, "project.json", SearchOption.AllDirectories).FirstOrDefault();
                if (string.IsNullOrWhiteSpace(projectJsonPath))
                {
                    return Fail("Bundle is missing project.json.", warnings, importFolderRel);
                }

                var projectJson = File.ReadAllText(projectJsonPath);
                var project = JsonUtility.FromJson<MotionForgeProjectData>(projectJson);
                if (project == null || project.version <= 0)
                {
                    return Fail("project.json is invalid or unsupported.", warnings, importFolderRel);
                }

                var manifest = LoadManifest(importFolderAbs, warnings);
                sceneRoot = new GameObject($"MotionForgeImport_{SanitizeSegment(bundleName)}");

                var bindPathToTransform = new Dictionary<string, Transform>(StringComparer.Ordinal);
                var objectIdToBindPath = new Dictionary<string, string>(StringComparer.Ordinal);
                var objectIdToName = new Dictionary<string, string>(StringComparer.Ordinal);
                var importedObjects = 0;

                for (var i = 0; i < project.objects.Length; i += 1)
                {
                    var row = project.objects[i];
                    if (string.IsNullOrEmpty(row.id))
                    {
                        warnings.Add($"Skipping primitive row {i}: missing id.");
                        continue;
                    }

                    var primitive = CreatePrimitive(row.geometryType);
                    if (primitive == null)
                    {
                        warnings.Add($"Skipping primitive '{row.name}': unsupported geometryType '{row.geometryType}'.");
                        continue;
                    }

                    primitive.name = string.IsNullOrWhiteSpace(row.name) ? row.id : row.name;
                    ApplyTransform(primitive.transform, row.position, row.rotation, row.scale);
                    var bindPath = ResolveBindPath(row.bindPath, primitive.name, row.id);
                    PlaceAtBindPath(sceneRoot.transform, primitive.transform, bindPath, bindPathToTransform);
                    objectIdToBindPath[row.id] = bindPath;
                    objectIdToName[row.id] = primitive.name;
                    importedObjects += 1;
                }

                var embeddedAssets = ResolveEmbeddedAssets(project, importFolderAbs, warnings);
                if (project.modelInstances.Length > 0 && !IsGltfImporterAvailable())
                {
                    return Fail(
                        "glTF importer not found. Install package 'com.unity.cloud.gltfast' before importing model bundles.",
                        warnings,
                        importFolderRel
                    );
                }

                for (var i = 0; i < project.modelInstances.Length; i += 1)
                {
                    var model = project.modelInstances[i];
                    if (string.IsNullOrEmpty(model.id))
                    {
                        warnings.Add($"Skipping model instance row {i}: missing id.");
                        continue;
                    }

                    if (!embeddedAssets.TryGetValue(model.assetId, out var assetPath))
                    {
                        return Fail(
                            $"Model instance '{model.name}' references missing embedded asset '{model.assetId}'.",
                            warnings,
                            importFolderRel
                        );
                    }

                    var bindPath = ResolveBindPath(model.bindPath, model.name, model.id);
                    var holder = new GameObject(string.IsNullOrWhiteSpace(model.name) ? model.id : model.name);
                    ApplyTransform(holder.transform, model.position, model.rotation, model.scale);
                    PlaceAtBindPath(sceneRoot.transform, holder.transform, bindPath, bindPathToTransform);

                    if (!TryImportGltf(assetPath, holder.transform, out var importError))
                    {
                        return Fail(
                            $"Failed to import glTF asset '{model.assetId}': {importError}",
                            warnings,
                            importFolderRel
                        );
                    }

                    RegisterHierarchyPaths(holder.transform, bindPath, bindPathToTransform);
                    objectIdToBindPath[model.id] = bindPath;
                    objectIdToName[model.id] = holder.name;
                    importedObjects += 1;
                }

                var createdClips = new List<(string TakeName, AnimationClip Clip, string AssetPath)>();
                var trackCount = 0;
                if (project.animation != null && project.animation.tracks.Length > 0)
                {
                    var takes = ResolveTakes(project, manifest, warnings);
                    var clipsByTake = BuildAnimationClips(
                        project,
                        takes,
                        sceneRoot.transform,
                        bindPathToTransform,
                        objectIdToBindPath,
                        objectIdToName,
                        warnings,
                        out trackCount
                    );

                    if (clipsByTake.Count > 0)
                    {
                        var animationsFolderRel = $"{importFolderRel}/Animations";
                        var animationsFolderAbs = ToAbsoluteProjectPath(animationsFolderRel);
                        Directory.CreateDirectory(animationsFolderAbs);
                        AssetDatabase.Refresh();

                        foreach (var takeClip in clipsByTake)
                        {
                            var baseAssetName = $"{SanitizeSegment(bundleName)}_{SanitizeSegment(takeClip.TakeName)}.anim";
                            var clipPath = AssetDatabase.GenerateUniqueAssetPath($"{animationsFolderRel}/{baseAssetName}");
                            AssetDatabase.CreateAsset(takeClip.Clip, clipPath);
                            createdClips.Add((takeClip.TakeName, takeClip.Clip, clipPath));
                        }
                        result.ClipAssetPath = createdClips[0].AssetPath;

                        if (options.AttachAnimatorController)
                        {
                            AttachAnimator(sceneRoot, createdClips, animationsFolderRel, bundleName);
                        }
                    }
                }

                Selection.activeGameObject = sceneRoot;
                EditorUtility.DisplayDialog(
                    "MotionForge Import Complete",
                    $"Bundle: {fileName}\nObjects: {importedObjects}\nTracks: {trackCount}\nClips: {createdClips.Count}\nDuration: {(project.animation?.durationSeconds ?? 0f):0.###}s",
                    "OK"
                );

                result.Ok = true;
                result.ImportFolder = importFolderRel;
                result.ImportedObjectCount = importedObjects;
                result.ImportedTrackCount = trackCount;
                result.ClipDurationSeconds = project.animation?.durationSeconds ?? 0f;
                result.Message = "Import complete.";
                result.Warnings = warnings.ToArray();
                return result;
            }
            catch (Exception ex)
            {
                if (sceneRoot != null)
                {
                    UnityEngine.Object.DestroyImmediate(sceneRoot);
                }

                warnings.Add(ex.Message);
                return Fail($"Unexpected importer error: {ex.Message}", warnings);
            }
            finally
            {
                AssetDatabase.SaveAssets();
                EditorUtility.ClearProgressBar();
            }
        }

        private static MotionForgeImportResult Fail(string message, List<string> warnings, string importFolder = "")
        {
            return new MotionForgeImportResult
            {
                Ok = false,
                Message = message,
                ImportFolder = importFolder,
                Warnings = warnings.ToArray()
            };
        }

        private static string BuildImportFolder(string bundleName)
        {
            var timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
            return $"{ImportRootFolder}/{SanitizeSegment(bundleName)}_{timestamp}";
        }

        private static string ToAbsoluteProjectPath(string assetRelativePath)
        {
            var projectRoot = Directory.GetParent(Application.dataPath)?.FullName ?? "";
            return Path.Combine(projectRoot, assetRelativePath.Replace("/", Path.DirectorySeparatorChar.ToString()));
        }

        private static void ExtractZipSafely(string zipPath, string outputRootAbs)
        {
            using var archive = ZipFile.OpenRead(zipPath);
            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.FullName))
                {
                    continue;
                }

                var destinationPath = Path.GetFullPath(Path.Combine(outputRootAbs, entry.FullName));
                if (!destinationPath.StartsWith(outputRootAbs, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException("Bundle contains unsafe path traversal entries.");
                }

                var destinationDir = Path.GetDirectoryName(destinationPath);
                if (!string.IsNullOrEmpty(destinationDir))
                {
                    Directory.CreateDirectory(destinationDir);
                }

                if (string.IsNullOrEmpty(entry.Name))
                {
                    continue;
                }

                entry.ExtractToFile(destinationPath, true);
            }
        }

        private static MotionForgeBundleManifest LoadManifest(string importFolderAbs, List<string> warnings)
        {
            var manifestPath = Directory.GetFiles(importFolderAbs, "motionforge-manifest.json", SearchOption.AllDirectories).FirstOrDefault();
            if (string.IsNullOrEmpty(manifestPath))
            {
                return null;
            }

            try
            {
                var raw = File.ReadAllText(manifestPath);
                return JsonUtility.FromJson<MotionForgeBundleManifest>(raw);
            }
            catch (Exception ex)
            {
                warnings.Add($"Manifest parse warning: {ex.Message}");
                return null;
            }
        }

        private static Dictionary<string, string> ResolveEmbeddedAssets(
            MotionForgeProjectData project,
            string importFolderAbs,
            List<string> warnings
        )
        {
            var map = new Dictionary<string, string>(StringComparer.Ordinal);
            for (var i = 0; i < project.assets.Length; i += 1)
            {
                var asset = project.assets[i];
                if (!string.Equals(asset.source.mode, "embedded", StringComparison.Ordinal))
                {
                    warnings.Add($"Asset '{asset.id}' is external and cannot be reconstructed from bundle binaries.");
                    continue;
                }

                var expectedName = BuildBundleAssetFileName(asset);
                var expectedPath = Path.Combine(importFolderAbs, "assets", expectedName);
                if (!File.Exists(expectedPath))
                {
                    var fallback = Directory.GetFiles(importFolderAbs, expectedName, SearchOption.AllDirectories).FirstOrDefault();
                    if (string.IsNullOrEmpty(fallback))
                    {
                        continue;
                    }
                    expectedPath = fallback;
                }

                map[asset.id] = expectedPath;
            }

            return map;
        }

        private static string BuildBundleAssetFileName(MotionForgeAssetData asset)
        {
            var sourceName = string.IsNullOrWhiteSpace(asset.source.fileName) ? asset.name : asset.source.fileName;
            var baseName = SanitizeSegment(sourceName);
            return $"{SanitizeSegment(asset.id)}-{(string.IsNullOrEmpty(baseName) ? "asset.bin" : baseName)}";
        }

        private static string ResolveBindPath(string bindPath, string displayName, string id)
        {
            if (!string.IsNullOrWhiteSpace(bindPath))
            {
                return NormalizeBindPath(bindPath);
            }
            if (!string.IsNullOrWhiteSpace(displayName))
            {
                return NormalizeBindPath(displayName);
            }
            return NormalizeBindPath(id);
        }

        private static string NormalizeBindPath(string value)
        {
            var parts = value
                .Replace("\\", "/")
                .Split('/')
                .Where(part => !string.IsNullOrWhiteSpace(part))
                .Select(SanitizeSegment)
                .ToArray();
            if (parts.Length == 0)
            {
                return "Object";
            }
            return string.Join("/", parts);
        }

        private static void PlaceAtBindPath(
            Transform root,
            Transform target,
            string bindPath,
            Dictionary<string, Transform> bindPathToTransform
        )
        {
            var parts = bindPath.Split('/');
            var parent = root;
            var prefix = "";
            for (var i = 0; i < parts.Length - 1; i += 1)
            {
                var segment = SanitizeSegment(parts[i]);
                prefix = string.IsNullOrEmpty(prefix) ? segment : $"{prefix}/{segment}";
                var child = parent.Find(segment);
                if (child == null)
                {
                    var go = new GameObject(segment);
                    child = go.transform;
                    child.SetParent(parent, false);
                }
                parent = child;
                bindPathToTransform[prefix] = child;
            }

            var leaf = parts.Length > 0 ? SanitizeSegment(parts[parts.Length - 1]) : "Object";
            target.name = leaf;
            target.SetParent(parent, false);
            bindPathToTransform[bindPath] = target;
        }

        private static void RegisterHierarchyPaths(
            Transform root,
            string rootPath,
            Dictionary<string, Transform> bindPathToTransform
        )
        {
            bindPathToTransform[rootPath] = root;
            for (var i = 0; i < root.childCount; i += 1)
            {
                var child = root.GetChild(i);
                var childPath = $"{rootPath}/{SanitizeSegment(child.name)}";
                RegisterHierarchyPaths(child, childPath, bindPathToTransform);
            }
        }

        private static GameObject CreatePrimitive(string geometryType)
        {
            return geometryType switch
            {
                "box" => GameObject.CreatePrimitive(PrimitiveType.Cube),
                "sphere" => GameObject.CreatePrimitive(PrimitiveType.Sphere),
                "cone" => null,
                _ => null
            };
        }

        private static void ApplyTransform(Transform target, float[] position, float[] rotation, float[] scale)
        {
            target.localPosition = ToVector3(position, Vector3.zero);
            target.localRotation = Quaternion.Euler(ToVector3(rotation, Vector3.zero) * Mathf.Rad2Deg);
            target.localScale = ToVector3(scale, Vector3.one);
        }

        private static Vector3 ToVector3(float[] data, Vector3 fallback)
        {
            if (data == null || data.Length != 3)
            {
                return fallback;
            }
            return new Vector3(data[0], data[1], data[2]);
        }

        private static bool IsGltfImporterAvailable()
        {
            return ResolveGltfImportType() != null;
        }

        private static Type ResolveGltfImportType()
        {
            return Type.GetType("GLTFast.GltfImport, glTFast");
        }

        private static bool TryImportGltf(string gltfPath, Transform parent, out string error)
        {
            error = "";
            var gltfImportType = ResolveGltfImportType();
            if (gltfImportType == null)
            {
                error = "GLTFast.GltfImport type not found.";
                return false;
            }

            try
            {
                var importer = Activator.CreateInstance(gltfImportType);
                var loadMethod = gltfImportType.GetMethods(BindingFlags.Instance | BindingFlags.Public)
                    .FirstOrDefault(method => method.Name == "Load" && method.GetParameters().Length > 0 &&
                                              method.GetParameters()[0].ParameterType == typeof(string));
                if (loadMethod == null)
                {
                    error = "Load API not found on GLTFast importer.";
                    return false;
                }

                var loadResult = loadMethod.Invoke(importer, BuildArguments(loadMethod.GetParameters(), gltfPath));
                if (!AwaitTaskResult(loadResult, out var loaded) || !loaded)
                {
                    error = "glTFast failed while loading GLB/GLTF asset.";
                    return false;
                }

                var instantiateMethod = gltfImportType.GetMethods(BindingFlags.Instance | BindingFlags.Public)
                    .FirstOrDefault(method =>
                        method.Name == "InstantiateMainSceneAsync" &&
                        method.GetParameters().Length > 0 &&
                        method.GetParameters()[0].ParameterType == typeof(Transform));
                if (instantiateMethod == null)
                {
                    error = "InstantiateMainSceneAsync API not found on GLTFast importer.";
                    return false;
                }

                var instantiateResult = instantiateMethod.Invoke(importer, BuildArguments(instantiateMethod.GetParameters(), parent));
                if (!AwaitTaskResult(instantiateResult, out var instantiated) || !instantiated)
                {
                    error = "glTFast failed while instantiating scene.";
                    return false;
                }

                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        private static object[] BuildArguments(ParameterInfo[] parameters, object firstArgument)
        {
            var args = new object[parameters.Length];
            for (var i = 0; i < parameters.Length; i += 1)
            {
                if (i == 0)
                {
                    args[i] = firstArgument;
                    continue;
                }

                if (parameters[i].HasDefaultValue)
                {
                    args[i] = parameters[i].DefaultValue;
                    continue;
                }

                if (parameters[i].ParameterType == typeof(CancellationToken))
                {
                    args[i] = default(CancellationToken);
                    continue;
                }

                args[i] = parameters[i].ParameterType.IsValueType
                    ? Activator.CreateInstance(parameters[i].ParameterType)
                    : null;
            }
            return args;
        }

        private static bool AwaitTaskResult(object maybeTask, out bool value)
        {
            value = false;
            if (maybeTask == null)
            {
                return false;
            }

            if (maybeTask is bool boolResult)
            {
                value = boolResult;
                return true;
            }

            if (maybeTask is Task task)
            {
                task.GetAwaiter().GetResult();
                var taskType = task.GetType();
                if (taskType.IsGenericType && taskType.GetGenericArguments()[0] == typeof(bool))
                {
                    value = (bool)taskType.GetProperty("Result")?.GetValue(task);
                    return true;
                }
                value = true;
                return true;
            }

            return false;
        }

        private static List<TakeRange> ResolveTakes(
            MotionForgeProjectData project,
            MotionForgeBundleManifest manifest,
            List<string> warnings
        )
        {
            var duration = Mathf.Max(0.0001f, project.animation?.durationSeconds ?? 0f);
            var takes = new List<TakeRange>();
            if (project.animation != null && project.animation.takes != null && project.animation.takes.Length > 0)
            {
                foreach (var take in project.animation.takes)
                {
                    if (take == null) continue;
                    if (string.IsNullOrWhiteSpace(take.name) || take.endTime <= take.startTime) continue;
                    takes.Add(new TakeRange
                    {
                        Id = string.IsNullOrWhiteSpace(take.id) ? $"take_{takes.Count + 1:00}" : take.id,
                        Name = take.name,
                        StartTime = Mathf.Max(0f, take.startTime),
                        EndTime = Mathf.Min(duration, take.endTime)
                    });
                }
            }

            if (takes.Count == 0 && manifest?.takes != null && manifest.takes.Length > 0)
            {
                foreach (var take in manifest.takes)
                {
                    if (take == null) continue;
                    if (string.IsNullOrWhiteSpace(take.name) || take.endTime <= take.startTime) continue;
                    takes.Add(new TakeRange
                    {
                        Id = string.IsNullOrWhiteSpace(take.id) ? $"take_{takes.Count + 1:00}" : take.id,
                        Name = take.name,
                        StartTime = Mathf.Max(0f, take.startTime),
                        EndTime = Mathf.Min(duration, take.endTime)
                    });
                }
            }

            if (takes.Count == 0)
            {
                takes.Add(new TakeRange
                {
                    Id = "take_main",
                    Name = "Main",
                    StartTime = 0f,
                    EndTime = duration
                });
                warnings.Add("No takes found in project animation; using fallback Main take.");
            }

            return takes
                .Where(take => take.EndTime > take.StartTime)
                .OrderBy(take => take.StartTime)
                .ThenBy(take => take.Id, StringComparer.Ordinal)
                .ToList();
        }

        private static List<(string TakeName, AnimationClip Clip)> BuildAnimationClips(
            MotionForgeProjectData project,
            List<TakeRange> takes,
            Transform sceneRoot,
            Dictionary<string, Transform> bindPathToTransform,
            Dictionary<string, string> objectIdToBindPath,
            Dictionary<string, string> objectIdToName,
            List<string> warnings,
            out int trackCount
        )
        {
            trackCount = 0;
            var clips = new List<(string TakeName, AnimationClip Clip)>();
            if (project.animation == null || project.animation.tracks == null || project.animation.tracks.Length == 0)
            {
                return clips;
            }

            foreach (var take in takes)
            {
                var clip = new AnimationClip
                {
                    frameRate = project.animation.fps > 0 ? project.animation.fps : DefaultFps
                };
                var curvesWritten = 0;

                for (var i = 0; i < project.animation.tracks.Length; i += 1)
                {
                    var track = project.animation.tracks[i];
                    if (track == null || track.keyframes == null || track.keyframes.Length == 0)
                    {
                        continue;
                    }

                    if (!TryMapProperty(track.property, out var propertyName, out var convertRadians))
                    {
                        warnings.Add($"Skipping unsupported track property '{track.property}'.");
                        continue;
                    }

                    var bindPath = ResolveTrackBindPath(track, objectIdToBindPath, objectIdToName, bindPathToTransform, warnings);
                    if (string.IsNullOrEmpty(bindPath) || !bindPathToTransform.TryGetValue(bindPath, out var target))
                    {
                        warnings.Add($"Skipping track '{track.property}' for object '{track.objectId}': bind target not found.");
                        continue;
                    }

                    var curve = BuildCurveForTake(track, take, convertRadians);
                    if (curve == null || curve.keys == null || curve.keys.Length == 0)
                    {
                        continue;
                    }

                    var relativePath = AnimationUtility.CalculateTransformPath(target, sceneRoot);
                    var binding = EditorCurveBinding.FloatCurve(relativePath, typeof(Transform), propertyName);
                    AnimationUtility.SetEditorCurve(clip, binding, curve);
                    trackCount += 1;
                    curvesWritten += 1;
                }

                if (curvesWritten > 0)
                {
                    clips.Add((take.Name, clip));
                }
            }

            return clips;
        }

        private sealed class CurvePoint
        {
            public float Time;
            public float Value;
            public string Interpolation = "linear";
        }

        private static AnimationCurve BuildCurveForTake(MotionForgeTrackData track, TakeRange take, bool convertRadians)
        {
            var sorted = track.keyframes.OrderBy(item => item.time).ToArray();
            if (sorted.Length == 0)
            {
                return null;
            }

            var points = new List<CurvePoint>();
            var startValue = EvaluateTrackAtTime(sorted, take.StartTime);
            var endValue = EvaluateTrackAtTime(sorted, take.EndTime);
            points.Add(new CurvePoint { Time = 0f, Value = startValue, Interpolation = "linear" });

            for (var i = 0; i < sorted.Length; i += 1)
            {
                if (sorted[i].time <= take.StartTime || sorted[i].time >= take.EndTime)
                {
                    continue;
                }
                points.Add(new CurvePoint
                {
                    Time = sorted[i].time - take.StartTime,
                    Value = sorted[i].value,
                    Interpolation = sorted[i].interpolation
                });
            }

            var duration = Mathf.Max(0.0001f, take.EndTime - take.StartTime);
            points.Add(new CurvePoint { Time = duration, Value = endValue, Interpolation = "linear" });
            points = points.OrderBy(point => point.Time).ToList();

            var keys = new Keyframe[points.Count];
            var values = new float[points.Count];
            for (var i = 0; i < points.Count; i += 1)
            {
                values[i] = convertRadians ? points[i].Value * Mathf.Rad2Deg : points[i].Value;
            }
            if (convertRadians)
            {
                UnwrapEulerAngles(values);
            }
            for (var i = 0; i < points.Count; i += 1)
            {
                keys[i] = new Keyframe(points[i].Time, values[i]);
            }

            var curve = new AnimationCurve(keys);
            for (var i = 0; i < points.Count; i += 1)
            {
                var mode = ToTangentMode(points[i].Interpolation);
                AnimationUtility.SetKeyLeftTangentMode(curve, i, mode);
                AnimationUtility.SetKeyRightTangentMode(curve, i, mode);
            }

            return curve;
        }

        private static float EvaluateTrackAtTime(MotionForgeKeyframeData[] keyframes, float time)
        {
            if (keyframes.Length == 1)
            {
                return keyframes[0].value;
            }
            if (time <= keyframes[0].time)
            {
                return keyframes[0].value;
            }
            if (time >= keyframes[keyframes.Length - 1].time)
            {
                return keyframes[keyframes.Length - 1].value;
            }

            for (var i = 0; i < keyframes.Length - 1; i += 1)
            {
                var a = keyframes[i];
                var b = keyframes[i + 1];
                if (time < a.time || time > b.time)
                {
                    continue;
                }

                if (a.interpolation == "step")
                {
                    return a.value;
                }

                var dt = b.time - a.time;
                if (Math.Abs(dt) < 0.00001f)
                {
                    return a.value;
                }

                var alpha = Mathf.Clamp01((time - a.time) / dt);
                var eased = ApplyInterpolation(alpha, a.interpolation);
                return Mathf.Lerp(a.value, b.value, eased);
            }

            return keyframes[keyframes.Length - 1].value;
        }

        private static float ApplyInterpolation(float alpha, string interpolation)
        {
            switch (interpolation)
            {
                case "linear":
                    return alpha;
                case "easeIn":
                    return alpha * alpha * alpha;
                case "easeOut":
                    var inv = 1f - alpha;
                    return 1f - inv * inv * inv;
                case "easeInOut":
                    if (alpha < 0.5f) return 4f * alpha * alpha * alpha;
                    var inv2 = -2f * alpha + 2f;
                    return 1f - (inv2 * inv2 * inv2) * 0.5f;
                default:
                    return alpha;
            }
        }

        private static void UnwrapEulerAngles(float[] values)
        {
            if (values.Length <= 1)
            {
                return;
            }
            var previous = values[0];
            for (var i = 1; i < values.Length; i += 1)
            {
                var current = values[i];
                while (current - previous > 180f) current -= 360f;
                while (current - previous < -180f) current += 360f;
                values[i] = current;
                previous = current;
            }
        }

        private static AnimationUtility.TangentMode ToTangentMode(string interpolation)
        {
            return interpolation switch
            {
                "step" => AnimationUtility.TangentMode.Constant,
                "linear" => AnimationUtility.TangentMode.Linear,
                "easeIn" => AnimationUtility.TangentMode.Auto,
                "easeOut" => AnimationUtility.TangentMode.Auto,
                "easeInOut" => AnimationUtility.TangentMode.Auto,
                _ => AnimationUtility.TangentMode.Auto
            };
        }

        private static string ResolveTrackBindPath(
            MotionForgeTrackData track,
            Dictionary<string, string> objectIdToBindPath,
            Dictionary<string, string> objectIdToName,
            Dictionary<string, Transform> bindPathToTransform,
            List<string> warnings
        )
        {
            if (!string.IsNullOrWhiteSpace(track.bindPath))
            {
                return NormalizeBindPath(track.bindPath);
            }

            if (!string.IsNullOrWhiteSpace(track.objectId) && objectIdToBindPath.TryGetValue(track.objectId, out var byId))
            {
                return byId;
            }

            if (!string.IsNullOrWhiteSpace(track.objectId) && objectIdToName.TryGetValue(track.objectId, out var name))
            {
                var sanitizedName = SanitizeSegment(name);
                var matches = bindPathToTransform.Keys.Where(path => path.EndsWith($"/{sanitizedName}", StringComparison.Ordinal) || path == sanitizedName).ToArray();
                if (matches.Length == 1)
                {
                    warnings.Add($"Track '{track.property}' used fallback name matching for object '{track.objectId}'.");
                    return matches[0];
                }
                if (matches.Length > 1)
                {
                    warnings.Add($"Track '{track.property}' object '{track.objectId}' has ambiguous name fallback.");
                }
            }

            return "";
        }

        private static bool TryMapProperty(string property, out string unityProperty, out bool convertRadians)
        {
            unityProperty = "";
            convertRadians = false;
            switch (property)
            {
                case "position.x":
                    unityProperty = "m_LocalPosition.x";
                    return true;
                case "position.y":
                    unityProperty = "m_LocalPosition.y";
                    return true;
                case "position.z":
                    unityProperty = "m_LocalPosition.z";
                    return true;
                case "rotation.x":
                    unityProperty = "localEulerAnglesRaw.x";
                    convertRadians = true;
                    return true;
                case "rotation.y":
                    unityProperty = "localEulerAnglesRaw.y";
                    convertRadians = true;
                    return true;
                case "rotation.z":
                    unityProperty = "localEulerAnglesRaw.z";
                    convertRadians = true;
                    return true;
                case "scale.x":
                    unityProperty = "m_LocalScale.x";
                    return true;
                case "scale.y":
                    unityProperty = "m_LocalScale.y";
                    return true;
                case "scale.z":
                    unityProperty = "m_LocalScale.z";
                    return true;
                default:
                    return false;
            }
        }

        private static void AttachAnimator(
            GameObject root,
            List<(string TakeName, AnimationClip Clip, string AssetPath)> clips,
            string animationsFolderRel,
            string bundleName
        )
        {
            if (clips == null || clips.Count == 0)
            {
                return;
            }

            var controllerName = $"{SanitizeSegment(bundleName)}_Controller.controller";
            var controllerPath = AssetDatabase.GenerateUniqueAssetPath($"{animationsFolderRel}/{controllerName}");
            var controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            var layer = controller.layers[0];
            var stateMachine = layer.stateMachine;
            var usedStateNames = new HashSet<string>(StringComparer.Ordinal);

            AnimatorState defaultState = null;
            foreach (var item in clips)
            {
                var baseName = string.IsNullOrWhiteSpace(item.TakeName) ? "Main" : item.TakeName;
                var stateName = SanitizeSegment(baseName);
                if (usedStateNames.Contains(stateName))
                {
                    var suffix = 2;
                    var candidate = $"{stateName}_{suffix}";
                    while (usedStateNames.Contains(candidate))
                    {
                        suffix += 1;
                        candidate = $"{stateName}_{suffix}";
                    }
                    stateName = candidate;
                }

                usedStateNames.Add(stateName);
                var state = stateMachine.AddState(stateName);
                state.motion = item.Clip;
                if (defaultState == null)
                {
                    defaultState = state;
                }
            }

            stateMachine.defaultState = defaultState;
            controller.layers = new[] { layer };

            var animator = root.GetComponent<Animator>();
            if (animator == null)
            {
                animator = root.AddComponent<Animator>();
            }
            animator.runtimeAnimatorController = controller;
        }

        private static string SanitizeSegment(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "Object";
            }

            var cleaned = value.Trim().Replace("\\", "/").Replace("/", "_");
            var chars = cleaned
                .Select(ch => char.IsLetterOrDigit(ch) || ch == '_' || ch == '-' || ch == '.' ? ch : '_')
                .ToArray();
            var normalized = new string(chars).Trim('_');
            return string.IsNullOrEmpty(normalized) ? "Object" : normalized;
        }
    }
}
