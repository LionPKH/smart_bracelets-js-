const express = require('express')
const session = require('express-session')
const database = require('./database')
const actions = require('./actions')

const app = express()
const port = 3000

app.set('view engine', 'ejs');

app.use('/assets', express.static('assets'))
app.use(session({ secret: 'secret', cookie: { maxAge: 1800 } }))
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

app.get('/tables', async (req, res) => {
    res.render('templates/tables', {
        patients: await actions.getData('patients'),
        auth: await actions.getData('auth'),
        medical_bracelets: await actions.getData('medical_bracelets'),
        measurements: await actions.getData('measurements'),
        alerts: await actions.getData('alerts'),
        alert_types: await actions.getData('alert_types')
    })
})

app.get('/measurements', async (req, res) => {
    res.render('templates/measurements', {
        table: await actions.getMeasurement()
    });
    // console.log(await actions.getMeasurement());
})

app.get('/alerts', async (req, res) => {
    res.render('templates/alerts', {
        table: await actions.getAlerts()
    });
    console.log(await actions.getAlerts());
})

app.get('/add_patient', (req, res) => {
    res.render('templates/add_patient')
})

app.get('/account', async (req, res) => {
    res.render('templates/account', {
        data: await actions.getPatientData
    })
})


app.post('/do_login', async (req, res) => {
    console.log(await actions.doLogin(req.body.username, req.body.password));
    result = await actions.doLogin(req.body.username, req.body.password)[0]
    req.session.user_id = await actions.doLogin(req.body.username, req.body.password)[1]
    console.log(req.session.user_id);
    if (result) {
        res.redirect('/tables')
    }
    else {
        res.redirect('/add_patient')
    }
})


app.post('/do_register', async (req, res) => {
    await actions.doRegister(req.body.username, req.body.password)
    res.status(200).send('ok')
})

app.post('/save_measurement', async (req, res) => {
    if (req.body.save) {
        const measurement_id = req.body.save;
        // Извлекаем обновленные значения. Предполагается, что значения передаются в виде массивов:
        const heart_rate = req.body.heart_rate;
        const blood_pressure_systolic = req.body.blood_pressure_systolic;
        const blood_pressure_diastolic = req.body.blood_pressure_diastolic;
        const blood_glucose_level = req.body.blood_glucose_level;
        const temperature = req.body.temperature;
        console.log(measurement_id, temperature);
        await actions.saveMeasurement(heart_rate, blood_pressure_diastolic, blood_pressure_systolic, blood_glucose_level, temperature, measurement_id)
        res.redirect('/measurements')
    }

})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})