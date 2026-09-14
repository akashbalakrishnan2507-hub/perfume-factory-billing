'use strict';

const { Server } = require('socket.io');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    // Client connected
    socket.on('disconnect', () => {});
  });

  console.log('[socket.io] WebSocket server initialized');
  return io;
}

function getIO() {
  return io;
}

function emitEvent(event, payload = {}) {
  if (!io) return;
  try {
    io.emit(event, { ...payload, timestamp: new Date().toISOString() });
    // Also emit general dashboard:update event whenever financial / procurement data changes
    if (['bill:created', 'bill:updated', 'bill:deleted', 'payment:created', 'rate:updated', 'customer:updated'].includes(event)) {
      io.emit('dashboard:update', { reason: event, timestamp: new Date().toISOString(), payload });
    }
  } catch (err) {
    console.error('[socket.io] Error emitting event:', err.message);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitEvent,
};
