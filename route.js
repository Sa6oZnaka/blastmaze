module.exports = function (app, passport, connection, serverRooms) {

    app.get('/login', function (req, res) {
        res.render('login.ejs', {
            message: req.flash('loginMessage')
        });
    });

    app.use(function (req, res, next) {
        res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        next();
    });

    app.post('/login', (req, res, next) => {
        passport.authenticate('local-login', (err, user, info) => {
            if (err) return next(err);
            if (!user) return res.redirect('/login');

            req.logIn(user, (err) => {
            if (err) return next(err);

            if (req.body.remember) {
                req.session.cookie.maxAge = 1000 * 60 * 3; // 3 минути
            } else {
                req.session.cookie.expires = false;
            }

            req.session.user = { 
                id: user.id, 
                username: user.username 
            };
            
            return res.redirect('/');
            });
        })(req, res, next);
    });


    app.get('/register', function (req, res) {
        res.render('register.ejs', {
            message: req.flash('registerMessage')
        });
    });

    app.post('/register', passport.authenticate('local-register', {
        successRedirect: '/',
        failureRedirect: '/register',
        failureFlash: true
    }));

    app.get('/', isLoggedIn, function (req, res) {
        res.render('index.ejs', null);
    });

    app.get('/getUser', isLoggedIn, function (req, res) {
        res.send(JSON.stringify({
            user: req.user.username,
            level: req.user.level_points,
            rank: req.user.rank_points,
            wins: req.user.wins,
        }));
        //serverRooms.addOnlineUser(req.cookies.io, req.user.username);
    });

    app.get('/getUserID', isLoggedIn, function (req, res) {
        let sql =
            `SELECT u.id 
            FROM user u WHERE u.id = ?`;
        connection.query(sql, [req.user.id], function (error, result) {
            if (error) return console.error("\x1b[33m" + error.message + "\x1b[0m");
            res.send(JSON.stringify(result));
        });
    });

    app.get('/logout', function (req, res) {
        req.session.destroy(function (err) {
            res.redirect('/login');
        });
    });

};

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated())
        return next();

    res.redirect('/login');
}