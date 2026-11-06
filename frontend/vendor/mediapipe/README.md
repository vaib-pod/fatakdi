# Bundled face tools

Runtime: `@mediapipe/tasks-vision` **1.1.1**, from the [official npm package](https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.1.1). Its Apache-2.0 license is included in `LICENSE`. The portable non-SIMD runtime is used for one-photo CPU inference.

Models are the pinned version 1 files distributed by Google MediaPipe:

- [BlazeFace short-range face detector](https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite), with [documentation and model card](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector).
- [SelfieMulticlass 256×256 segmentation model](https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite), with [documentation and model card](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter).

The app loads these files from its own server only when the user opens face capture. Inference and compositing run in the browser. Original camera frames are never uploaded or written to browser storage. A small transparent cutout is relayed to room members only when the user enables party face sharing; it is held in memory rather than saved to disk.

Upstream project: [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe).
