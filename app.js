/*
 * Copyright (c) Microsoft. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

var express = require('express')
  , app = express()
// load up the certificates
  , certConf = require('./certconf')
// create the socket server
  , socketServer = require('https').createServer(certConf, app)
  , dbHelper = new (require('./db-helper'))
// bind it to socket.io
  , io = require('socket.io')(socketServer);

socketServer.listen(3001);
module.exports = io;

var path = require('path')
  , favicon = require('serve-favicon')
  , logger = require('morgan')
  , cookieParser = require('cookie-parser')
  , bodyParser = require('body-parser')
  , passport = require('passport')
  , session = require('express-session')
  , AzureAdOAuth2Strategy = require('passport-azure-ad-oauth2')
  , azureConfig = require('./ws-conf').azureConf
  , googleConfig = require('./ws-conf').googleConf
  , routes = require('./routes/index')
  , connect = require('./routes/connect')
  , disconnect = require('./routes/disconnect')
  , dbHelperInstance = new (require('./db-helper'))()
  , jwt = require('jsonwebtoken')
  , ONE_DAY_MILLIS = 86400000
  , GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

// teach passport how to use Google
passport.use(new GoogleStrategy(googleConfig,
  function (req, accessToken, refreshToken, profile, done) {
    dbHelper.getUser(req.query.state, function (err, user) {
      console.log('Google profile: ' + JSON.stringify(profile));
  
      // get the user or init a new one
      var userData = user || {};
      if (!userData.sessid) {
        userData.sessid = req.query.state;
      }
      if (!userData.providers) {
        userData.providers = [];
      }
  
      userData.providers.push({
        accessToken: accessToken,
        providerName: profile.provider,
        familyName: profile.name.familyName,
        givenName: profile.name.givenName,
        name: profile.displayName
      });
  
      dbHelperInstance.insertDoc(userData, null,
        function (err, body) {
          if (!err) {
            console.log('Inserted session entry [' + userData.sessid + '] id: ' + body.id);
          }
          done(err, userData);
        });
    });
  }));

// teach passport how to use Azure
passport.use('azure', new AzureAdOAuth2Strategy(azureConfig,
  function (req, accessToken, refreshToken, params, profile, done) {
    dbHelper.getUser(req.query.state, function (err, user) {
      var aadProfile = jwt.decode(params.id_token);
      console.log('User: ' + JSON.stringify(user));
  
      var userData = user || {};
      if (!userData.sessid) {
        userData.sessid = req.query.state;
      }
  
      if (!userData.providers) {
        userData.providers = [];
      }
  
      userData.providers.push({
        accessToken: accessToken,
        providerName: 'azure',
        familyName: aadProfile.family_name,
        givenName: aadProfile.given_name,
        name: aadProfile.name,
        uniqueName: aadProfile.unique_name,
        ver: aadProfile.ver
      });
  
      dbHelperInstance.insertDoc(userData, null,
        function (err, body) {
          if (!err) {
            console.log('Inserted session entry [' + userData.sessid + '] id: ' + body.id);
          }
          done(null, userData);
        });
    });
  }));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  name: 'nodecookie',
  cookie: {
    path: '/',
    httpOnly: false,
    secure: false,
    maxAge: 7 * ONE_DAY_MILLIS
  },
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/connect', connect);
app.use('/disconnect', disconnect);

passport.serializeUser(function (user, done) {
  done(null, user.sessid);
});

passport.deserializeUser(function (sessid, done) {
  dbHelperInstance.getUser(sessid, function (err, user) {
    done(null, user);
  });
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

module.exports = app;
