const express = require('express')
const session = require('express-session')
const database = require('./database')
const actions = require('./actions')

const app = express()
const port = 3000

app.set('view engine', 'ejs');

app.use('/assets', express.static('assets'))
app.use(session({ secret: 'secret', cookie: { maxAge: 1800 }}))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.render('templates/index', {
    user: undefined,
  })
})

app.get('/login', (req, res) => {
    res.render('templates/login')
  })

app.post('/do_login', (req, res) => {
    if (actions.doLogin(req.body.username, req.body.password) === true) {
        res.status(200).send('ok')
    }
    else {
        res.status(403).send('not ok')
    }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})