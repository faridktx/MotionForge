using System;

namespace MotionForge.Unity.Editor
{
    [Serializable]
    internal sealed class MotionForgeBundleManifest
    {
        public int version;
        public string exportedAt = "";
        public int projectVersion;
        public string primaryModelAssetId = "";
        public MotionForgeTakeData[] takes = Array.Empty<MotionForgeTakeData>();
        public MotionForgeClipNamingData clipNaming = new MotionForgeClipNamingData();
    }

    [Serializable]
    internal sealed class MotionForgeClipNamingData
    {
        public string pattern = "";
        public string fallbackTakeName = "Main";
    }

    [Serializable]
    internal sealed class MotionForgeProjectData
    {
        public int version;
        public MotionForgeObjectData[] objects = Array.Empty<MotionForgeObjectData>();
        public MotionForgeAssetData[] assets = Array.Empty<MotionForgeAssetData>();
        public MotionForgeModelInstanceData[] modelInstances = Array.Empty<MotionForgeModelInstanceData>();
        public MotionForgeAnimationData animation;
    }

    [Serializable]
    internal sealed class MotionForgeObjectData
    {
        public string id = "";
        public string name = "";
        public string bindPath = "";
        public string geometryType = "";
        public int color;
        public float[] position = Array.Empty<float>();
        public float[] rotation = Array.Empty<float>();
        public float[] scale = Array.Empty<float>();
    }

    [Serializable]
    internal sealed class MotionForgeAssetSource
    {
        public string mode = "";
        public string fileName = "";
        public string path = "";
    }

    [Serializable]
    internal sealed class MotionForgeAssetData
    {
        public string id = "";
        public string name = "";
        public string type = "";
        public MotionForgeAssetSource source = new MotionForgeAssetSource();
        public int size;
    }

    [Serializable]
    internal sealed class MotionForgeModelInstanceData
    {
        public string id = "";
        public string name = "";
        public string bindPath = "";
        public string assetId = "";
        public float[] position = Array.Empty<float>();
        public float[] rotation = Array.Empty<float>();
        public float[] scale = Array.Empty<float>();
    }

    [Serializable]
    internal sealed class MotionForgeAnimationData
    {
        public float durationSeconds;
        public float fps;
        public MotionForgeTakeData[] takes = Array.Empty<MotionForgeTakeData>();
        public MotionForgeTrackData[] tracks = Array.Empty<MotionForgeTrackData>();
    }

    [Serializable]
    internal sealed class MotionForgeTakeData
    {
        public string id = "";
        public string name = "";
        public float startTime;
        public float endTime;
    }

    [Serializable]
    internal sealed class MotionForgeTrackData
    {
        public string objectId = "";
        public string bindPath = "";
        public string property = "";
        public MotionForgeKeyframeData[] keyframes = Array.Empty<MotionForgeKeyframeData>();
    }

    [Serializable]
    internal sealed class MotionForgeKeyframeData
    {
        public float time;
        public float value;
        public string interpolation = "linear";
    }

    internal sealed class MotionForgeImportOptions
    {
        public bool AttachAnimatorController = true;
    }

    internal sealed class MotionForgeImportResult
    {
        public bool Ok;
        public string Message = "";
        public string ImportFolder = "";
        public int ImportedObjectCount;
        public int ImportedTrackCount;
        public float ClipDurationSeconds;
        public string ClipAssetPath = "";
        public string[] Warnings = Array.Empty<string>();
    }
}
