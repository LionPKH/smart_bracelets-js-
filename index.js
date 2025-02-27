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
    cookie: { maxAge: 1800000 }, //maxAge in ms
    store: new SequelizeStore({
        db: sequelize,
    })
}))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//middleware

app.use(async (req, res, next) => {
    if (req.originalUrl.startsWith('/private/')) {
        if (typeof req.session.user === 'undefined') {
            res.redirect('/login')
            return
        }
        if (req.session.user.patient_id === null && req.originalUrl !== '/private/add_patient' && req.originalUrl !== '/private/save_patient') {
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
        data: await actions.getPatientData(req.session.user.id),
        user: req.session.user.patient_id,
        alerts: await actions.getPatientAlerts(req.session.user.patient_id),
        measurements: await actions.getPatientMeasurement(req.session.user.patient_id)
    })
    console.log(await actions.getPatientData(req.session.user.patient_id))
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
    res.redirect('/login')
})

app.post('/private/do_logout', (req, res) => {
    req.session.destroy
    res.redirect('/login')
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
        await actions.generateAlertsForAllPatients()
        res.redirect('/private/measurements')
    }

})

app.post('/private/save_patient', async (req, res) => {
    const { name, surname, gender, date_of_birth, phone, email, address } = req.body;
    const errors = [];

    // Валидация данных
    if (!name) errors.push('Введите имя.');
    if (!surname) errors.push('Введите фамилию.');
    if (!gender) errors.push('Выберите пол.');
    if (!date_of_birth || new Date(date_of_birth) > new Date()) errors.push('Некорректная дата рождения.');
    if (!phone) errors.push('Введите номер телефона.');
    if (!email || !/\S+@\S+\.\S+/.test(email)) errors.push('Некорректный формат электронной почты.');

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    // Проверка на дубликаты
    const existingPatient = await actions.findPatientByDetails({ name, surname, phone, email });
    if (existingPatient) {
        return res.status(400).json({ errors: ['Пациент с такими данными уже существует.'] });
    }

    // Добавление пациента
    const patientId = await actions.addPatient({ name, surname, gender, date_of_birth, phone, email, address });

    // Обновление записи авторизации
    await actions.updateAuthWithPatientId(req.session.user.id, patientId);

    // Добавление медицинского браслета
    const braceletId = await actions.addMedicalBracelet({
        patient_id: patientId,
        serial_number: 'SN' + Math.floor(Math.random() * 1000),
        model: 'Model X',
        activated_date: new Date()
    });

    // Добавление стандартных измерений
    await actions.addMeasurement({
        bracelet_id: braceletId,
        timestamp: new Date(),
        heart_rate: 75,
        blood_pressure_systolic: 120,
        blood_pressure_diastolic: 80,
        blood_glucose_level: 5.5,
        temperature: 36.6
    });
    req.session.user = await actions.getUser(req.session.user.id)
    res.redirect('/private/tables');
});

app.post('/private/delete_account', async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ error: 'Пользователь не авторизован' });
    }

    const userId = req.session.user.id;

    try {
        // Получаем данные пользователя
        const user = await actions.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const patientId = user.patient_id;

        if (patientId) {
            // Удаляем оповещения, связанные с пациентом
            await actions.deleteAlertsByPatientId(patientId);

            // Получаем все браслеты пациента
            const braceletIds = await actions.getBraceletsByPatientId(patientId);

            if (braceletIds.length > 0) {
                // Удаляем измерения для браслетов
                await actions.deleteMeasurementsByBraceletIds(braceletIds);

                // Удаляем браслеты
                await actions.deleteBraceletsByPatientId(patientId);
            }

            // Удаляем данные пациента
            await actions.deletePatientById(patientId);
        }

        // Удаляем пользователя из auth
        await actions.deleteUserById(userId);

        // Завершаем сессию
        req.session.destroy((err) => {
            if (err) {
                console.error('Ошибка при завершении сессии:', err);
                return res.status(500).json({ error: 'Ошибка при завершении сессии' });
            }

            // Перенаправляем на главную страницу
            res.redirect('/');
        });
    } catch (error) {
        console.error('Ошибка при удалении аккаунта:', error);
        res.status(500).json({ error: 'Ошибка при удалении аккаунта' });
    }
});

app.post('/private/resolve_alert', async (req, res) => {
    const { alert_id } = req.body;

    if (!alert_id) {
        return res.status(400).json({ error: 'Неверный запрос: отсутствует alert_id' });
    }

    try {
        // Получаем информацию об оповещении
        const alert = await actions.getAlertById(alert_id);
        if (!alert) {
            return res.status(404).json({ error: 'Оповещение не найдено' });
        }

        const { measurement_id, metric } = alert;

        // Обновляем оповещение как решённое
        await actions.resolveAlert(alert_id);

        // Устанавливаем нормальные значения для метрики
        const normalValues = {
            heart_rate: 80,
            systolic: 120,
            diastolic: 80,
            blood_glucose_level: 5.5,
            temperature: 36.6
        };

        await actions.updateMeasurement(measurement_id, metric, normalValues);

        // Перенаправляем обратно на страницу оповещений
        res.redirect('/private/alerts');
    } catch (error) {
        console.error('Ошибка при обновлении оповещения:', error);
        res.status(500).json({ error: 'Ошибка при обновлении оповещения' });
    }
});


app.get('/private/edit_patient', async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ error: 'Пользователь не авторизован' });
    }

    const userId = req.session.user.id;

    try {
        // Получаем данные пользователя
        const user = await actions.getUserById(userId);
        if (!user || !user.patient_id) {
            return res.status(404).json({ error: 'У вас нет данных пациента для редактирования. <a href="/private/add_patient">Добавить данные</a>' });
        }

        const patientId = user.patient_id;

        // Получаем данные пациента
        const patient = await actions.getPatientData(userId);
        if (!patient.results[0]) {
            return res.status(404).json({ error: 'Запись о пациенте не найдена. <a href="/private/add_patient">Добавить данные</a>' });
        }

        const { name, surname, gender, date_of_birth, phone, email, address } = patient.results[0];

        // Рендерим шаблон с данными пациента
        res.render('templates/edit_patient', {
            name,
            surname,
            gender,
            date_of_birth,
            phone,
            email,
            address,
            errors: []
        });
    } catch (error) {
        console.error('Ошибка при загрузке данных пациента:', error);
        res.status(500).json({ error: 'Ошибка при загрузке данных пациента' });
    }
});

// Маршрут для обработки формы редактирования
app.post('/private/edit_patient', async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ error: 'Пользователь не авторизован' });
    }

    const userId = req.session.user.id;
    const { name, surname, gender, date_of_birth, phone, email, address } = req.body;
    const errors = [];

    // Валидация данных
    if (!name) errors.push('Введите имя.');
    if (!surname) errors.push('Введите фамилию.');
    if (!gender) errors.push('Выберите пол.');
    if (!date_of_birth) {
        errors.push('Введите дату рождения.');
    } else {
        const dobTimestamp = new Date(date_of_birth).getTime();
    }
    if (!phone) errors.push('Введите номер телефона.');
    if (!email) {
        errors.push('Введите электронную почту.');
    } else if (!/\S+@\S+\.\S+/.test(email)) {
        errors.push('Некорректный формат электронной почты.');
    }

    if (errors.length > 0) {
        // Если есть ошибки, рендерим форму с ошибками
        return res.render('templates/edit_patient', {
            name,
            surname,
            gender,
            date_of_birth,
            phone,
            email,
            address,
            errors
        });
    }

    try {
        // Получаем данные пользователя
        const user = await actions.getUserById(userId);
        if (!user || !user.patient_id) {
            return res.status(404).json({ error: 'У вас нет данных пациента для редактирования. <a href="/private/add_patient">Добавить данные</a>' });
        }

        const patientId = user.patient_id;

        // Обновляем данные пациента
        const sql = `
            UPDATE patients 
            SET name = ?, surname = ?, gender = ?, date_of_birth = ?, phone = ?, email = ?, address = ?
            WHERE patient_id = ?
        `;
        const params = [name, surname, gender, date_of_birth, phone, email, address, patientId];

        await new Promise((resolve, reject) => {
            database.query(sql, params, (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        // Перенаправляем на страницу аккаунта
        res.redirect('/private/account');
    } catch (error) {
        console.error('Ошибка при обновлении данных пациента:', error);
        res.status(500).json({ error: 'Ошибка при обновлении данных пациента' });
    }
});


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})