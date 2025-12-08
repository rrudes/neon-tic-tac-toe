const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

app.use(express.static("public"));

const rooms = {}; 

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 mins
const roomTimers = {};

function createEmptyBoard() {
  return Array(9).fill(null);
}

// UPDATED: Now returns { symbol, line } instead of just symbol
function checkWinner(b) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b1, c] of lines) {
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) {
      return { symbol: b[a], line: [a, b1, c] };
    }
  }
  return null;
}

function getActivePlayersCount(room) {
    return (room.players.X ? 1 : 0) + (room.players.O ? 1 : 0);
}

function cleanupRoom(roomId) {
  if (roomTimers[roomId]) {
    clearTimeout(roomTimers[roomId]);
    delete roomTimers[roomId];
  }
  delete rooms[roomId];
  console.log(`Room ${roomId} cleaned up`);
}

function scheduleRoomCleanup(roomId) {
  if (roomTimers[roomId]) clearTimeout(roomTimers[roomId]);
  roomTimers[roomId] = setTimeout(() => {
    cleanupRoom(roomId);
  }, INACTIVITY_TIMEOUT);
}

io.on("connection", socket => {
  console.log("User connected:", socket.id);

  // joinRoom now accepts { roomId, password, playerName }
  socket.on("joinRoom", ({ roomId, password, playerName }) => {
    // defensive: ensure roomId is a string before trimming
    roomId = String(roomId || "").trim().toLowerCase();
    playerName = String(playerName || "Anonymous").trim().slice(0, 30);
    
    // simple validation
    if (!roomId || roomId.length < 3) {
      socket.emit("roomError", "Room code must be at least 3 characters.");
      return;
    }

    if (!rooms[roomId]) {
      rooms[roomId] = {
        password: password || "",
        board: createEmptyBoard(),
        players: { X: null, O: null }, 
        playerNames: {},            // socket.id -> playerName
        turn: "X",
        moves: 0
      };
      console.log(`Room ${roomId} created`);
    }

    const room = rooms[roomId];

    if (room.password && room.password !== password) {
      socket.emit("roomError", "Incorrect password.");
      return;
    }

    let symbol = null;
    if (room.players.X === socket.id) symbol = "X";
    else if (room.players.O === socket.id) symbol = "O";
    else {
        if (room.players.X === null) { room.players.X = socket.id; symbol = "X"; }
        else if (room.players.O === null) { room.players.O = socket.id; symbol = "O"; }
    }

    // Store player name for this socket in room
    room.playerNames[socket.id] = playerName;
    
    socket.join(roomId);

    const activePlayers = getActivePlayersCount(room);

    socket.emit("init", {
      symbol,
      board: room.board,
      turn: room.turn,
      playersCount: activePlayers
    });

    socket.emit("roomJoined", roomId); // Send roomId back for confirmation
    io.to(roomId).emit("playersCount", activePlayers);

    // System announcement that a named player has joined
    io.to(roomId).emit("chatMessage", {
      senderName: "System",
      message: `${playerName} has entered the grid`,
      symbol: null
    });

    scheduleRoomCleanup(roomId);
  });

  // listen for chat messages from clients
  socket.on("chatMessage", ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("roomError", "Room not found. Cannot send message.");
      return;
    }
    const msg = String(message || "").trim();
    if (!msg) return;

    const senderName = room.playerNames?.[socket.id] || "Anonymous";
    const symbol = room.players.X === socket.id ? "X" : room.players.O === socket.id ? "O" : null;

    // Broadcast to the room
    io.to(roomId).emit("chatMessage", {
      senderName,
      message: msg,
      symbol
    });

    scheduleRoomCleanup(roomId);
  });

  // NEW: listen for emoji reactions from clients and broadcast to room
  socket.on("sendReaction", ({ roomId, emoji }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("roomError", "Room not found. Cannot send reaction.");
      return;
    }
    const em = String(emoji || "").trim().slice(0, 4); // limit length
    if (!em) return;
    // Broadcast reaction to everyone in the room (including sender)
    io.to(roomId).emit("playerReaction", { emoji: em, senderId: socket.id });
    scheduleRoomCleanup(roomId);
  });

  socket.on("makeMove", ({ roomId, index, symbol }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("roomError", "Room not found. Please rejoin."); 
      return;
    }
    
    if (room.players[symbol] !== socket.id) {
        socket.emit("roomError", `You are not player ${symbol}. Access denied.`);
        return;
    }

    if (room.turn !== symbol) {
      socket.emit("roomError", "Not your turn.");
      return;
    }

    if (room.board[index]) {
      socket.emit("roomError", "Cell taken.");
      return;
    }

    room.board[index] = symbol;
    room.moves++;
    room.turn = symbol === "X" ? "O" : "X";

    const winData = checkWinner(room.board);
    const winner = winData ? winData.symbol : null;
    const winningLine = winData ? winData.line : null;
    const isDraw = !winner && room.moves === 9;

    // Broadcast move AND winning line info
    io.to(roomId).emit("moveMade", {
      index,
      symbol,
      turn: room.turn,
      winner,
      winningLine, 
      isDraw
    });

    if (winner || isDraw) {
      setTimeout(() => {
        room.board = createEmptyBoard();
        room.turn = "X";
        room.moves = 0;
        io.to(roomId).emit("resetBoard");
      }, 3000); // Increased to 3s to let the confetti settle
    }

    scheduleRoomCleanup(roomId);
  });

  socket.on("disconnecting", () => {
    for (const rid of socket.rooms) {
      // skip the socket's own room id
      if (rid === socket.id) continue;
      if (!rooms[rid]) continue;
      const room = rooms[rid];
      let wasPlayer = false;
      // capture leaving player's name
      const leavingName = room.playerNames?.[socket.id] || "A player";

      if (room.players.X === socket.id) { room.players.X = null; wasPlayer = true; }
      if (room.players.O === socket.id) { room.players.O = null; wasPlayer = true; }

      // Remove stored name mapping
      if (room.playerNames && room.playerNames[socket.id]) {
        delete room.playerNames[socket.id];
      }

      // system announcement
      io.to(rid).emit("chatMessage", {
        senderName: "System",
        message: `${leavingName} has left the grid`,
        symbol: null
      });

      const activePlayers = getActivePlayersCount(room);
      // always emit updated count to room (spectators + players)
      io.to(rid).emit("playersCount", activePlayers);

      if (activePlayers === 0) cleanupRoom(rid);
      else scheduleRoomCleanup(rid);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Server running on http://localhost:${PORT}`);
});