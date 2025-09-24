const { createServer } = require('./gameRoom');

const PORT = process.env.PORT || 3000;

const server = createServer({ botsEnabled: true });

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
