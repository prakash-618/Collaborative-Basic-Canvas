# ARCHITECTURE

## Data Flow
1. User draws on canvas -> client samples pointer points, emits `stroke:data` (batched) to server.
2. Server appends an immutable `op` (stroke) to room history and broadcasts `stroke:remote` to other clients.
3. Clients render in real-time using received points. For consistency (undo/redo), server can send `history:rebuild`.

## WebSocket Protocol (messages)
- `join` {room, name} -> server assigns color, sends `init` with {history, users}
- `stroke:data` {points, color, width, tool, opId} -> server stores op and broadcasts `stroke:remote`
- `cursor` {x, y} -> broadcast for live cursors
- `undo` / `redo` {opId?} -> server updates history (mark undone/redone) and broadcasts `history:rebuild`
- `history:rebuild` {ops} -> clients clear canvas and replay ops in order

## Undo/Redo strategy
- Server maintains an ordered array of ops `{id, author, tool, points, color, width, undone:false}`
- Undo marks an op's `undone = true`. Redo sets `undone = false`.
- To ensure global consistency, server rebuilds canvas state by replaying ops where `undone == false`.
- Clients receive `history:rebuild` and redraw entire visible state. This avoids complex operational transform logic.

## Conflict resolution
- Strokes are immutable operations. Overlapping strokes are allowed; later strokes draw over earlier ones.
- Undo operates per-op (not per-user). If user A undoes their last op, it will be removed from global history (visible to all).
- This choice simplifies semantics for this assignment. For production, consider per-user undo stack or CRDTs.

## Performance decisions
- Client-side sampling + batching (emit every 40ms) reduces network chatter.
- Server stores only op metadata and raw points; no images.
- Rebuild on undo/redo is simple; for large histories, implement snapshotting or per-tile invalidation.
