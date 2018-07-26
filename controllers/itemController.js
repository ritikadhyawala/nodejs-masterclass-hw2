var _data = require('./../services/data');
var handler = {};
//Items in restaurant
handler.items = function (data, callback) {
    // Lookup the items
    _data.read('items', "items", function (err, data) {
        if (!err && data) {
            callback(200, data);
        } else {
            callback(404);
        }
    });
};

module.exports = handler;