// wrapper around socket.io client
const socket = io();

function joinRoom(room = 'main', name = '') {
  socket.emit('join', {room, name});
}

// expose socket for other modules
window._socket = socket;
