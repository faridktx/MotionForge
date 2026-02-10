using UnityEditor;
using UnityEngine;

namespace MotionForge.Unity.Editor
{
    internal sealed class MotionForgeBundleImporterWindow : EditorWindow
    {
        private string _bundlePath = "";
        private bool _attachAnimator = true;

        [MenuItem("Tools/MotionForge/Import Bundle")]
        private static void OpenWindow()
        {
            var window = GetWindow<MotionForgeBundleImporterWindow>("MotionForge Import");
            window.minSize = new Vector2(520f, 220f);
            window.Show();
        }

        private void OnGUI()
        {
            EditorGUILayout.LabelField("MotionForge Bundle Importer", EditorStyles.boldLabel);
            EditorGUILayout.Space(6f);
            EditorGUILayout.HelpBox(
                "Imports motionforge-bundle.zip, reconstructs scene objects, and generates AnimationClip assets.",
                MessageType.Info
            );

            EditorGUILayout.Space(6f);
            using (new EditorGUILayout.HorizontalScope())
            {
                EditorGUILayout.PrefixLabel("Bundle (.zip)");
                _bundlePath = EditorGUILayout.TextField(_bundlePath ?? "");
                if (GUILayout.Button("Browse", GUILayout.Width(90f)))
                {
                    var selected = EditorUtility.OpenFilePanel("Select MotionForge Bundle", "", "zip");
                    if (!string.IsNullOrEmpty(selected))
                    {
                        _bundlePath = selected;
                    }
                }
            }

            _attachAnimator = EditorGUILayout.ToggleLeft("Create and attach Animator Controller", _attachAnimator);

            GUILayout.FlexibleSpace();
            using (new EditorGUILayout.HorizontalScope())
            {
                GUILayout.FlexibleSpace();
                if (GUILayout.Button("Import Bundle", GUILayout.Width(160f), GUILayout.Height(30f)))
                {
                    RunImport();
                }
            }
        }

        private void RunImport()
        {
            if (string.IsNullOrWhiteSpace(_bundlePath))
            {
                EditorUtility.DisplayDialog("MotionForge Import", "Select a bundle .zip file first.", "OK");
                return;
            }

            var options = new MotionForgeImportOptions
            {
                AttachAnimatorController = _attachAnimator
            };
            var result = MotionForgeBundleImporter.Import(_bundlePath, options);

            if (!result.Ok)
            {
                var warnings = result.Warnings.Length > 0 ? "\n\nWarnings:\n- " + string.Join("\n- ", result.Warnings) : "";
                EditorUtility.DisplayDialog("MotionForge Import Failed", $"{result.Message}{warnings}", "OK");
                return;
            }

            if (result.Warnings.Length > 0)
            {
                Debug.LogWarning($"[MotionForge] Import completed with warnings:\n- {string.Join("\n- ", result.Warnings)}");
            }
            Debug.Log(
                $"[MotionForge] Import complete. Folder: {result.ImportFolder}, Objects: {result.ImportedObjectCount}, Tracks: {result.ImportedTrackCount}, Clip: {result.ClipAssetPath}"
            );
        }
    }
}
