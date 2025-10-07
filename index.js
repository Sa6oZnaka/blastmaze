const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('express-flash');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app); 

const io = new Server(server);
const connection = require('./dbInit');

app.set('view engine', 'ejs')
    .use(cookieParser())
    .use(bodyParser.urlencoded({
        extended: true
    }))
    .use(session({
        secret: 'justasecret',
        resave: true,
        saveUninitialized: true
    }))
    //.use('/src', express.static('src'))
    //.use('/config', express.static('config'))
    //.use('/assets', express.static('assets'))
    .use(passport.initialize())
    .use(passport.session())
    .use(flash());
    //.use(express.static('src'));

app.use(express.static('public'));


require('./gameRoom')(io);
require('./passport')(passport, connection);
require('./route')(app, passport, connection);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
