# 🕹️ Neon Tic-Tac-Toe

A modern, highly interactive, multiplayer Tic-Tac-Toe game with a Cyberpunk/Neon aesthetic. Play against friends in real-time with slick animations, synthesized sound effects, and smooth gameplay.

## ✨ Features

- **Real-time Multiplayer:** Play instantly with anyone using a room code, powered by Socket.io.
- **Cyberpunk Aesthetic:** Full glassmorphism UI, neon glow effects, and a dynamic particle background.
- **Audio Experience:** Custom synthesized sound effects for hovering, clicking, winning, losing, tying, and chatting.
- **Interactive Chat & Reactions:** Send messages and floating emoji reactions to your opponent during the match.
- **3D Board Tilt:** Interactive board that reacts to your mouse movements for enhanced immersion.
- **Rematch System:** Easily request and accept rematches without leaving the room.

## 🚀 Tech Stack

- **Frontend:** HTML5, CSS3 (Custom Properties, Flexbox/Grid, Animations), Vanilla JavaScript
- **Backend:** Node.js, Express
- **Real-time Engine:** Socket.io
- **Extras:** Canvas Confetti for victory celebrations, Web Audio API for synthesized sound generation.

## 🎮 How to Play

1. **Host a Game:** Enter a Room Code, optional Password, and your Alias. Click **Initialize Link**.
2. **Join a Game:** Have your friend enter the *same* Room Code and Password.
3. **Play:** Once both players are connected, the match begins! Click a cell when it's your turn.
4. **Communicate:** Use the chat box to send messages or the emoji bar to send floating reactions.
5. **Rematch:** When the game ends, request a rematch to play again instantly.

## 🛠️ Setup Instructions

To run this project locally:

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd tictactoe
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Start the server:**
   ```bash
   npm start
   ```
4. Open your browser and navigate to `http://localhost:3000`.