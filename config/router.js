const mainController = require("./../controllers/mainController");
const itemController = require("./../controllers/itemController");
const defaultController = require("./../controllers/defaultController");

var router = {
    "users": mainController.users,
    "tokens": mainController.tokens,
    "orders": mainController.orders,
    "carts": mainController.carts,
    "items": itemController.items
}

router.notFound = defaultController.notFound;

module.exports = router;