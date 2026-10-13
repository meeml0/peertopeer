const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Map of userId -> socketId and socketId -> userId
const onlineUsers = new Map(); // userId -> socketId
const socketToUser = new Map(); // socketId -> userId

app.get('/', (req, res) => {
  res.send({ status: 'Signaling Server Running', onlineCount: onlineUsers.size });
});

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Register user with their Supabase/App User ID
  socket.on('register_user', (userId) => {
    if (!userId) return;
    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);
    console.log(`[User Registered] User ID: ${userId} -> Socket: ${socket.id}`);
    
    // Kendisine mevcut tüm online kullanıcıların listesini gönder
    socket.emit('online_users_list', Array.from(onlineUsers.keys()));

    // Herkese bu kullanıcının online olduğunu bildir
    io.emit('user_status_changed', { userId, status: 'online' });
  });

  // Call Request (Caller initiates to Callee)
  socket.on('call_user', ({ toUserId, callerName, callerAvatar, callType, offer }) => {
    const targetSocketId = onlineUsers.get(toUserId);
    const callerUserId = socketToUser.get(socket.id);

    console.log(`[Call Attempt] From: ${callerUserId} (${callerName}) -> To: ${toUserId}`);

    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming_call', {
        fromUserId: callerUserId,
        callerName,
        callerAvatar,
        callType: callType || 'video', // 'video' or 'audio'
        offer
      });
    } else {
      socket.emit('call_failed', {
        reason: 'USER_OFFLINE',
        message: 'Kullanıcı şu anda çevrimdışı.'
      });
    }
  });

  // Answer Call (Callee accepts and sends back SDP Answer)
  socket.on('answer_call', ({ toUserId, answer }) => {
    const calleeUserId = socketToUser.get(socket.id);
    const targetSocketId = onlineUsers.get(toUserId);
    console.log(`[Call Answered] From Callee: ${calleeUserId} -> To Caller: ${toUserId} (Socket: ${targetSocketId})`);

    if (targetSocketId) {
      io.to(targetSocketId).emit('call_answered', {
        fromUserId: calleeUserId,
        answer
      });
    } else {
      console.warn(`[Answer Failed] Caller socket bulunamadi: ${toUserId}`);
    }
  });

  // Reject Call
  socket.on('reject_call', ({ toUserId }) => {
    const targetSocketId = onlineUsers.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_rejected', {
        fromUserId: socketToUser.get(socket.id)
      });
    }
  });

  // End / Hangup Call
  socket.on('end_call', ({ toUserId }) => {
    const senderUserId = socketToUser.get(socket.id);
    const targetSocketId = onlineUsers.get(toUserId);
    console.log(`[Call Ended] Sender: ${senderUserId} -> Target: ${toUserId} (Socket: ${targetSocketId})`);

    if (targetSocketId) {
      io.to(targetSocketId).emit('call_ended', {
        fromUserId: senderUserId
      });
    }
  });

  // ICE Candidate exchange
  socket.on('ice_candidate', ({ toUserId, candidate }) => {
    const targetSocketId = onlineUsers.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice_candidate', {
        fromUserId: socketToUser.get(socket.id),
        candidate
      });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id);
    if (userId) {
      onlineUsers.delete(userId);
      socketToUser.delete(socket.id);
      console.log(`[User Disconnected] User ID: ${userId}`);
      io.emit('user_status_changed', { userId, status: 'offline' });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`>>> Signaling Server listening on port ${PORT}`);
});
