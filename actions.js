const bcrypt = require('bcrypt');
const database = require('./database');

async function doLogin(login, password) {

    return new Promise((resolve, reject) => {
        database.query('SELECT * FROM `auth` WHERE `username` = ?', [login], function (error, results, fields) {
            if (results.length > 0) {
                console.log(`user (${login}) is found`)
                var hash = results[0].password_hash.replace('$2y$', '$2a$');
                bcrypt.compare(password, hash, function (err, correct) {
                    console.log(correct, `user (${login}) is authorized`);
                    return resolve([results[0].patient_id, results[0].id])
                });
            }
            else {
                console.log(`User (${login}) is not found`)
                return resolve(false)
            };

        });
    });
};

async function doRegister(login, password) {
    const auth = new Promise((resolve, reject) => {
        database.query('SELECT * FROM `auth` WHERE `username` = ?', [login], function (error, results, fields) {

            return resolve(results);
        });
    });
    if ((await auth).length === 0) {
        const user = new Promise(async (resolve, reject) => {
            const salt = await bcrypt.genSalt();
            const hash = new String(await bcrypt.hash(password, salt).then(function (hash) { return hash; })).replace('$2b$', '$2y$');
            database.query('INSERT INTO `auth` (`username`, `password_hash`) VALUES (?, ?)', [login, hash], function (error, results, fields) {
                console.log(`user (${login}) is created`);
            })
            console.log('Новый аккаунт заведен');
            return resolve();
        });
        await user;
    }
    else {
        console.log(`Это имя пользователя (${login}) уже занято`);
    }
}

async function getData(tableName) {
    return new Promise((resolve, reject) => {
        database.query(`SELECT * FROM ${tableName}`, [], function (error, results, fields) {
            return resolve({ results: results, fields: fields, tableName: tableName });
        })
    })
}

async function getMeasurement() {
    return new Promise((resolve, reject) => {
        database.query('SELECT m.*, p.name AS patient_name, p.surname AS patient_surname, b.serial_number AS bracelet_serial FROM measurements m JOIN medical_bracelets b ON m.bracelet_id = b.bracelet_id JOIN patients p ON b.patient_id = p.patient_id ORDER BY m.timestamp DESC', [], function (error, results, fields) {
            return resolve({ results: results, fields: fields });
        })
    })
}

async function saveMeasurement(heart_rate, bpd, bps, bgl, temp, measurement_id) {
    return new Promise((resolve, reject) => {
        database.query('UPDATE measurements SET heart_rate = ?, blood_pressure_systolic = ?, blood_pressure_diastolic = ?, blood_glucose_level = ?, temperature = ? WHERE measurement_id = ?', [heart_rate, bps, bpd, bgl, temp, measurement_id], function (error, results, fields) {
            return resolve(results);
        })
    })

}

async function getAlerts() {
    return new Promise((resolve, reject) => {
        database.query('SELECT a.*, CONCAT(p.name, " ",  p.surname) AS patient_name, at.alert_type, m.heart_rate, m.blood_pressure_systolic, m.blood_pressure_diastolic, m.blood_glucose_level, m.temperature FROM alerts a JOIN patients p ON a.patient_id = p.patient_id JOIN alert_types at ON a.alert_type_id = at.alert_type_id JOIN measurements m ON a.measurement_id = m.measurement_id WHERE a.resolved = FALSE ORDER BY a.alert_timestamp DESC', [], function (error, results, fields) {
            return resolve({ results: results, fields: fields });
        })
    })
}

async function getPatientData(user_id) {
    return new Promise((resolve, reject) => {
        database.query('SELECT a.id AS auth_id, a.username, p.patient_id, p.name, p.surname, p.gender, p.date_of_birth, p.phone, p.email, p.address FROM auth a LEFT JOIN patients p ON a.patient_id = p.patient_id WHERE a.id = ?', [user_id], function (error, results, fields) {
            return resolve({ results: results, fields: fields });
        })
    })
}

async function getPatientAlerts(patient_id) {
    return new Promise((resolve, reject) => {
        database.query(`SELECT a.*, at.alert_type, m.heart_rate, m.blood_pressure_systolic, 
                            m.blood_pressure_diastolic, 
                            m.blood_glucose_level, 
                            m.temperature
                        FROM alerts a
                        JOIN alert_types at ON a.alert_type_id = at.alert_type_id
                        JOIN measurements m ON a.measurement_id = m.measurement_id
                        WHERE a.patient_id = ? AND a.resolved = FALSE
                        ORDER BY a.alert_timestamp DESC`, [patient_id], function (error, results, fields) {
            return resolve({ results: results, fields: fields });
        })
    })
}

async function getPatientMeasurement(patient_id) {
    return new Promise((resolve, reject) => {
        database.query(`SELECT m.*, b.serial_number, b.model
            FROM measurements m
            JOIN medical_bracelets b ON m.bracelet_id = b.bracelet_id
            WHERE b.patient_id = ?
            ORDER BY m.timestamp DESC`, [patient_id], function (error, results, fields) {
            return resolve({ results: results, fields: fields })
        })
    })
}

exports.doLogin = doLogin
exports.doRegister = doRegister
exports.getData = getData
exports.getMeasurement = getMeasurement
exports.saveMeasurement = saveMeasurement
exports.getAlerts = getAlerts
exports.getPatientData = getPatientData
exports.getPatientAlerts = getPatientAlerts
exports.getPatientMeasurement = getPatientMeasurement