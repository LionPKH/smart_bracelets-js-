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
                    return resolve(results[0])
                });
            }
            else {
                console.log(`User (${login}) is not found`)
                return resolve(undefined)
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
        database.query(`SELECT a.id AS auth_id, a.username, p.patient_id, 
            p.name, p.surname, p.gender, p.date_of_birth, p.phone, 
            p.email, p.address FROM auth a LEFT JOIN patients 
            p ON a.patient_id = p.patient_id WHERE a.id = ?`, [user_id], function (error, results, fields) {
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


async function generateAlerts(measurement) {
    const alertTypes = await new Promise((resolve, reject) => {
        database.query(
            "SELECT alert_type_id, alert_type, metric, min_value, max_value FROM alert_types",
            (error, results) => {
                if (error) return reject(error);
                resolve(results);
            }
        );
    });
    for (const type of alertTypes) {
        const metric = type.metric;

        // Проверяем, есть ли данный metric в измерении
        if (!(metric in measurement)) {
            continue;
        }

        const value = parseFloat(measurement[metric]);
        let trigger = false;

        // Проверяем нижний порог
        if (type.min_value !== null && value < parseFloat(type.min_value)) {
            trigger = true;
        }

        // Проверяем верхний порог
        if (type.max_value !== null && value > parseFloat(type.max_value)) {
            trigger = true;
        }

        if (trigger) {
            // Генерируем сообщение оповещения
            const alertMessage = `${type.alert_type} обнаружено у пациента ID: ${measurement.patient_id}`;

            try {
                await new Promise((resolve, reject) => {
                    database.query(
                        `INSERT INTO alerts (patient_id, measurement_id, alert_type_id, alert_message) 
                         VALUES (?, ?, ?, ?)`,
                        [
                            measurement.patient_id,
                            measurement.measurement_id,
                            type.alert_type_id,
                            alertMessage,
                        ],
                        (error, results) => {
                            if (error) {
                                console.error("Ошибка при вставке оповещения:", error);
                                return reject(error);
                            }
                            resolve(results);
                        }
                    );
                });
            } catch (error) {
                console.error("Ошибка при создании оповещения:", error);
            }
        }
    }
}

async function generateAlertsForAllPatients() {
    // Удаляем все существующие нерешённые оповещения
    await new Promise((resolve, reject) => {
        database.query("DELETE FROM alerts", (error, results) => {
            if (error) return reject(error);
            resolve(results);
        });
    });

    // Получаем список всех пациентов
    const patients = await new Promise((resolve, reject) => {
        database.query("SELECT patient_id FROM patients", (error, results) => {
            if (error) return reject(error);
            resolve(results);
        });
    });

    for (const patient of patients) {
        const patientId = patient.patient_id;

        // Получаем последнее измерение для пациента
        const measurement = await new Promise((resolve, reject) => {
            database.query(
                `SELECT m.*, b.patient_id FROM measurements m
                     JOIN medical_bracelets b ON m.bracelet_id = b.bracelet_id
                     WHERE b.patient_id = ? 
                     ORDER BY m.timestamp DESC LIMIT 1`,
                [patientId],
                (error, results) => {
                    if (error) return reject(error);
                    resolve(results[0] || null);
                }
            );
        });

        if (measurement) {
            // Добавляем patient_id в объект измерения
            measurement.patient_id = patientId;

            // Генерируем оповещения для этого измерения
            await generateAlerts(measurement);
        }
    }

}



// Функция для добавления пациента
async function addPatient(data) {
    return new Promise((resolve, reject) => {
        const sql = 'INSERT INTO patients (name, surname, gender, date_of_birth, phone, email, address) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const params = [data.name, data.surname, data.gender, data.date_of_birth, data.phone, data.email, data.address];
        database.query(sql, params, function (error, results, fields) {
            if (error) return reject(error);
            resolve(results.insertId); // Возвращаем ID нового пациента
        });
    });
}

// Функция для поиска пациента по данным
async function findPatientByDetails(data) {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM patients WHERE name = ? AND surname = ? AND phone = ? AND email = ?';
        const params = [data.name, data.surname, data.phone, data.email];
        database.query(sql, params, function (error, results, fields) {
            if (error) return reject(error);
            resolve(results[0]); // Возвращаем первого найденного пациента или undefined
        });
    });
}

// Функция для обновления записи авторизации с ID пациента
async function updateAuthWithPatientId(userId, patientId) {
    return new Promise((resolve, reject) => {
        const sql = 'UPDATE auth SET patient_id = ? WHERE id = ?';
        const params = [patientId, userId];
        database.query(sql, params, function (error, results, fields) {
            if (error) return reject(error);
            resolve(results);
        });
    });
}

// Функция для добавления медицинского браслета
async function addMedicalBracelet(data) {
    return new Promise((resolve, reject) => {
        const sql = 'INSERT INTO medical_bracelets (patient_id, serial_number, model, activated_date) VALUES (?, ?, ?, ?)';
        const params = [data.patient_id, data.serial_number, data.model, data.activated_date];
        database.query(sql, params, function (error, results, fields) {
            if (error) return reject(error);
            resolve(results.insertId); // Возвращаем ID нового браслета
        });
    });
}

// Функция для добавления измерений
async function addMeasurement(data) {
    return new Promise((resolve, reject) => {
        const sql = 'INSERT INTO measurements (bracelet_id, timestamp, heart_rate, blood_pressure_systolic, blood_pressure_diastolic, blood_glucose_level, temperature) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const params = [data.bracelet_id, data.timestamp, data.heart_rate, data.blood_pressure_systolic, data.blood_pressure_diastolic, data.blood_glucose_level, data.temperature];
        database.query(sql, params, function (error, results, fields) {
            if (error) return reject(error);
            resolve(results);
        });
    });
}

async function getUser(userId) {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM auth WHERE id = ?';
        const params = [userId];
        database.query(sql, params, (error, results) => {
            if (error) return reject(error);
            resolve(results[0]); // Возвращаем первого найденного пользователя или undefined
        });
    });
}



async function getUserById(userId) {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM auth WHERE id = ?';
        database.query(sql, [userId], (error, results) => {
            if (error) return reject(error);
            resolve(results[0]); // Возвращаем первого найденного пользователя или undefined
        });
    });
}

async function deleteAlertsByPatientId(patientId) {
    return new Promise((resolve, reject) => {
        const sql = 'DELETE FROM alerts WHERE patient_id = ?';
        database.query(sql, [patientId], (error, results) => {
            if (error) return reject(error);
            resolve(results);
        });
    });
}

async function getBraceletsByPatientId(patientId) {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT bracelet_id FROM medical_bracelets WHERE patient_id = ?';
        database.query(sql, [patientId], (error, results) => {
            if (error) return reject(error);
            resolve(results.map(row => row.bracelet_id)); // Возвращаем массив ID браслетов
        });
    });
}

async function deleteMeasurementsByBraceletIds(braceletIds) {
    return new Promise((resolve, reject) => {
        const sql = 'DELETE FROM measurements WHERE bracelet_id IN (?)';
        database.query(sql, [braceletIds], (error, results) => {
            if (error) return reject(error);
            resolve(results);
        });
    });
}

async function deleteBraceletsByPatientId(patientId) {
    return new Promise((resolve, reject) => {
        const sql = 'DELETE FROM medical_bracelets WHERE patient_id = ?';
        database.query(sql, [patientId], (error, results) => {
            if (error) return reject(error);
            resolve(results);
        });
    });
}

async function deletePatientById(patientId) {
    return new Promise((resolve, reject) => {
        const sql = 'DELETE FROM patients WHERE patient_id = ?';
        database.query(sql, [patientId], (error, results) => {
            if (error) return reject(error);
            resolve(results);
        });
    });
}

async function deleteUserById(userId) {
    return new Promise((resolve, reject) => {
        const sql = 'DELETE FROM auth WHERE id = ?';
        database.query(sql, [userId], (error, results) => {
            if (error) return reject(error);
            resolve(results);
        });
    });
}


async function getAlertById(alertId) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT a.measurement_id, at.metric
            FROM alerts a
            JOIN alert_types at ON a.alert_type_id = at.alert_type_id
            WHERE a.alert_id = ?
        `;
        database.query(sql, [alertId], (error, results) => {
            if (error) return reject(error);
            resolve(results[0]); // Возвращаем первое найденное оповещение или undefined
        });
    });
}

async function resolveAlert(alertId) {
    return new Promise((resolve, reject) => {
        const sql = 'UPDATE alerts SET resolved = TRUE WHERE alert_id = ?';
        database.query(sql, [alertId], (error, results) => {
            if (error) return reject(error);
            resolve(results);
        });
    });
}

async function updateMeasurement(measurementId, metric, normalValues) {
    return new Promise((resolve, reject) => {
        let sql;
        let params;

        switch (metric) {
            case 'heart_rate':
                sql = 'UPDATE measurements SET heart_rate = ? WHERE measurement_id = ?';
                params = [normalValues.heart_rate, measurementId];
                break;

            case 'blood_pressure_systolic':
            case 'blood_pressure_diastolic':
                sql = `
                    UPDATE measurements 
                    SET blood_pressure_systolic = ?, blood_pressure_diastolic = ? 
                    WHERE measurement_id = ?
                `;
                params = [normalValues.systolic, normalValues.diastolic, measurementId];
                break;

            case 'blood_glucose_level':
                sql = 'UPDATE measurements SET blood_glucose_level = ? WHERE measurement_id = ?';
                params = [normalValues.blood_glucose_level, measurementId];
                break;

            case 'temperature':
                sql = 'UPDATE measurements SET temperature = ? WHERE measurement_id = ?';
                params = [normalValues.temperature, measurementId];
                break;

            default:
                return reject(new Error('Неизвестный параметр метрики.'));
        }

        database.query(sql, params, (error, results) => {
            if (error) return reject(error);
            resolve(results);
        });
    });
}


exports.updateMeasurement = updateMeasurement
exports.resolveAlert = resolveAlert
exports.getAlertById = getAlertById
exports.deleteUserById = deleteUserById
exports.deletePatientById = deletePatientById
exports.deleteBraceletsByPatientId = deleteBraceletsByPatientId
exports.deleteMeasurementsByBraceletIds = deleteMeasurementsByBraceletIds
exports.getBraceletsByPatientId = getBraceletsByPatientId
exports.deleteAlertsByPatientId = deleteAlertsByPatientId
exports.getUserById = getUserById
exports.addMeasurement = addMeasurement
exports.addMedicalBracelet = addMedicalBracelet
exports.addMedicalBracelet = addMedicalBracelet
exports.updateAuthWithPatientId = updateAuthWithPatientId
exports.findPatientByDetails = findPatientByDetails
exports.addPatient = addPatient
exports.doLogin = doLogin
exports.doRegister = doRegister
exports.getData = getData
exports.getMeasurement = getMeasurement
exports.saveMeasurement = saveMeasurement
exports.getAlerts = getAlerts
exports.getPatientData = getPatientData
exports.getPatientAlerts = getPatientAlerts
exports.getPatientMeasurement = getPatientMeasurement
exports.generateAlertsForAllPatients = generateAlertsForAllPatients
exports.getUser = getUser