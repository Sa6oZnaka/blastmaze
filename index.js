const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); // по-нов синтаксис

const app = express();
const server = http.createServer(app);   // създаваме http сървър

const io = new Server(server);           // връзваме socket.io към server

app.use(express.static('public'));

require('./gameRoom')(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
