const bcrypt = require('bcrypt');
const database = require('./database');

async function doLogin(login, password) {
    // Проверяем наличие пользователя с указанным юзернеймом
    // $stmt = $pdo->prepare("SELECT * FROM `auth` WHERE `username` = :username");
    // $stmt->execute(['username' => $_POST['username']]);
    // if (!$stmt->rowCount()) {
    //     flash('Пользователь с такими данными не зарегистрирован');
    //     header('Location: login.php');
    //     die;
    // }
    // $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return new Promise((resolve, reject) => {
        database.query('SELECT * FROM `auth` WHERE `username` = ?', [login], function (error, results, fields) {
            if (results.length > 0) {
                console.log(`user (${login}) is found`)
                var hash = results[0].password_hash.replace('$2y$', '$2a$');
                bcrypt.compare(password, hash, function (err, correct) {
                    console.log(correct, `user (${login}) is authorized`);
                    return resolve(correct)
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
            const hash = new String (await bcrypt.hash(password, salt).then(function (hash) { return hash; })).replace('$2b$', '$2y$');
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
            return resolve({results:results, fields:fields, tableName:tableName});
        })
    })
}

async function getMeasurement() {
    return new Promise((resolve,reject) => {
        database.query('SELECT m.*, p.name AS patient_name, p.surname AS patient_surname, b.serial_number AS bracelet_serial FROM measurements m JOIN medical_bracelets b ON m.bracelet_id = b.bracelet_id JOIN patients p ON b.patient_id = p.patient_id ORDER BY m.timestamp DESC', [], function(error, results, fields) {
            return resolve({results:results, fields:fields});
        })
    })
}

async function saveMeasurement(heart_rate, bpd, bps, bgl, temp, measurement_id) {
    return new Promise((resolve, reject) => {
        database.query('UPDATE measurements SET heart_rate = ?, blood_pressure_systolic = ?, blood_pressure_diastolic = ?, blood_glucose_level = ?, temperature = ? WHERE measurement_id = ?', [heart_rate, bps, bpd, bgl, temp, measurement_id], function(error, results, fields) {
            return resolve(results)
        })
    })

}


// if (isset($_POST['save'])) {
//     $measurement_id = $_POST['save'];
//     // Получаем обновленные значения
//     $heart_rate = $_POST['heart_rate'][$measurement_id];
//     $blood_pressure_systolic = $_POST['blood_pressure_systolic'][$measurement_id];
//     $blood_pressure_diastolic = $_POST['blood_pressure_diastolic'][$measurement_id];
//     $blood_glucose_level = $_POST['blood_glucose_level'][$measurement_id];
//     $temperature = $_POST['temperature'][$measurement_id];

//     $sql = "UPDATE measurements SET heart_rate = :heart_rate, blood_pressure_systolic = :bps, 
//     blood_pressure_diastolic = :bpd, blood_glucose_level = :bgl, temperature = :temperature 
//     WHERE measurement_id = :measurement_id";
//     $stmt = $pdo->prepare($sql);
//     $stmt->bindParam(':heart_rate', $heart_rate);
//     $stmt->bindParam(':bps', $blood_pressure_systolic);
//     $stmt->bindParam(':bpd', $blood_pressure_diastolic);
//     $stmt->bindParam(':bgl', $blood_glucose_level);
//     $stmt->bindParam(':temperature', $temperature);
//     $stmt->bindParam(':measurement_id', $measurement_id);

//     try {
//         $stmt->execute();

//         // Генерируем оповещения для всех пациентов
//         generateAlertsForAllPatients($pdo);

//         header('Location: measurements.php');
//         exit;
//     } catch (PDOException $e) {
//         die("Ошибка при обновлении измерения: " . $e->getMessage());
//     }
// } else {
//     die("Неверный запрос");
// }


exports.doLogin = doLogin
exports.doRegister = doRegister
exports.getData = getData
exports.getMeasurement = getMeasurement
exports.saveMeasurement = saveMeasurement