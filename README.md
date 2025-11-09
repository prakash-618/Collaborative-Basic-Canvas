<<<<<<< HEAD
# Collaborative Canvas

A minimal real-time collaborative drawing application (Vanilla JS + Node.js + Socket.io).

## Quick start
1. `npm install`
2. `npm start`
3. Open http://localhost:3000 in multiple browser windows/tabs to test.

## Features
- Brush, eraser, colors, stroke width
- Real-time sync with cursor indicators
- Global undo/redo (operation log replay)
- Simple conflict-resolution: immutable strokes; undo marks an op removed and server rebuilds canvas state
- Basic batching and throttling of drawing events

## Known limitations
- Not production hardened (no auth, no persistence)
- Replaying history redraws entire canvas (simple but can be optimized)
- Performance degrades with very large history (add snapshots or tiled layers for improvement)

## Time spent
~6 hours (prototype)
=======
# Collaborative-Basic-Canvas
>>>>>>> e4e83795a2190feb1475c393948b3416f700562a
