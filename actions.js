const bcrypt = require('bcrypt');
const database = require('./database')

function doLogin(login, password){
    // Проверяем наличие пользователя с указанным юзернеймом
    // $stmt = $pdo->prepare("SELECT * FROM `auth` WHERE `username` = :username");
    // $stmt->execute(['username' => $_POST['username']]);
    // if (!$stmt->rowCount()) {
    //     flash('Пользователь с такими данными не зарегистрирован');
    //     header('Location: login.php');
    //     die;
    // }
    // $user = $stmt->fetch(PDO::FETCH_ASSOC);
    let isAuthorized = false
    database.query('SELECT * FROM `auth` WHERE `username` = ?', [login], function(error, results, fields) {
        if (results.length > 0) {
            console.log(`user (${login}) is found`)
            var hash = results[0].password_hash.replace('$2y$', '$2a$');
            bcrypt.compare(password, hash, function(err, correct) {
                console.log(correct, `user (${login}) is authorized`);
                return correct
    });
        } 
        else {
            console.log(`User (${login}) is not found`)
            return false
        }

    })
    // return isAuthorized
}

exports.doLogin = doLogin