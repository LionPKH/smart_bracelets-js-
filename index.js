const express = require('express')
const Sequelize = require("sequelize")
const session = require('express-session')
const database = require('./database')
const actions = require('./actions')

const SequelizeStore = require("connect-session-sequelize")(session.Store);

const sequelize = new Sequelize("database", "username", "password", {
    dialect: "sqlite",
    storage: "./session.sqlite",
});

sequelize.sync();

const app = express()
const port = 3000

app.set('view engine', 'ejs');

app.use('/assets', express.static('assets'))
app.use(session({
    secret: 'secret',
    cookie: { maxAge: 18000000 }, //maxAge in ms
    store: new SequelizeStore({
        db: sequelize,
    })
}))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//middleware

app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/private/')) {
        if (typeof req.session.user === 'undefined') {
            res.redirect('/login')
            return
        }
        if (req.session.user.patient_id === null && req.originalUrl !== '/private/add_patient') {
            res.redirect('/private/add_patient')
            return
        }
    }
    next()
})

app.get('/', (req, res) => {
    res.render('templates/index', {
        user: undefined,
    })
})

app.get('/login', (req, res) => {
    res.render('templates/login')
})

app.get('/private/tables', async (req, res) => {
    console.log(req.session.user);
    res.render('templates/tables', {
        patients: await actions.getData('patients'),
        auth: await actions.getData('auth'),
        medical_bracelets: await actions.getData('medical_bracelets'),
        measurements: await actions.getData('measurements'),
        alerts: await actions.getData('alerts'),
        alert_types: await actions.getData('alert_types')
    })
})

app.get('/private/measurements', async (req, res) => {
    res.render('templates/measurements', {
        table: await actions.getMeasurement()
    });
    // console.log(await actions.getMeasurement());
})

app.get('/private/alerts', async (req, res) => {
    res.render('templates/alerts', {
        table: await actions.getAlerts()
    });
    console.log(await actions.getAlerts());
})

app.get('/private/add_patient', (req, res) => {
    res.render('templates/add_patient')
})

app.get('/private/account', async (req, res) => {
    res.render('templates/account', {
        data: await actions.getPatientData(req.session.user.patient_id),
        user: req.session.user.patient_id,
        alerts: await actions.getPatientAlerts(req.session.user.patient_id),
        measurements: await actions.getPatientMeasurement(req.session.user.patient_id)
    })
})


app.post('/do_login', async (req, res) => {
    const user = await actions.doLogin(req.body.username, req.body.password);
    if (typeof user === 'undefined') {
        res.redirect('/login')
    }
    else {
        req.session.user = user
        if (user.patient_id === null) {
            res.redirect('/private/add_patient')
        }
        else {
            res.redirect('/private/tables')
        }
    }
})


app.post('/do_register', async (req, res) => {
    await actions.doRegister(req.body.username, req.body.password)
    res.status(200).send('ok')
})

app.post('/private/save_measurement', async (req, res) => {
    if (req.body.save) {
        const measurement_id = req.body.save;
        // Извлекаем обновленные значения. Предполагается, что значения передаются в виде массивов:
        const heart_rate = req.body.heart_rate;
        const blood_pressure_systolic = req.body.blood_pressure_systolic;
        const blood_pressure_diastolic = req.body.blood_pressure_diastolic;
        const blood_glucose_level = req.body.blood_glucose_level;
        const temperature = req.body.temperature;
        await actions.saveMeasurement(heart_rate, blood_pressure_diastolic, blood_pressure_systolic, blood_glucose_level, temperature, measurement_id)
        console.log(await actions.generateAlertsForAllPatients());
        res.redirect('/private/measurements')
    }

})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})