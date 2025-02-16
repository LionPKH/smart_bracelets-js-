var mysql      = require('mysql');
var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : '',
  database : 'smart_bracelets'
});

connection.connect((err) => {
  if (err) {
    console.error(`MySQL: Failed to connect to MySQL: ${err.message}`, err);
    return;
  }

  console.log('MySQL: Successfully connected to MySQL');
});

module.exports = connection;