var _data = require('./../services/data');
var helpers = require('./../services/helpers');
var config = require('./../config/config');
var https = require("https");
var qs = require("querystring");

// Define all the handlers
var handlers = {};
// Users
handlers.users = function (data, callback) {
    var acceptableMethods = ['post', 'get', 'put', 'delete'];
    if (acceptableMethods.indexOf(data.method) > -1) {
        handlers._users[data.method](data, callback);
    } else {
        callback(405);
    }
};

// Container for all the users methods
handlers._users = {};

// Users - post
// Required data: name, email, address, password
// Optional data: none
handlers._users.post = function (data, callback) {
    // Check that all required fields are filled out
    var name = typeof (data.payload.name) == 'string' && data.payload.name.trim().length > 0 ? data.payload.name.trim() : false;
    var email = typeof (data.payload.email) == 'string' && data.payload.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.payload.email.trim() : false;
    var address = typeof (data.payload.address) == 'string' && data.payload.address.trim().length > 0 ? data.payload.address.trim() : false;
    var password = typeof (data.payload.password) == 'string' && data.payload.password.trim().length > 0 ? data.payload.password.trim() : false;

    if (name && email && address && password) {
        // Make sure the user doesnt already exist
        _data.read('users', email, function (err, data) {
            if (err) {
                // Hash the password
                var hashedPassword = helpers.hash(password);

                // Create the user object
                if (hashedPassword) {
                    var userObject = {
                        'name': name,
                        'email': email,
                        'address': address,
                        'hashedPassword': hashedPassword
                    };

                    // Store the user
                    _data.create('users', email, userObject, function (err) {
                        if (!err) {
                            callback(200);
                        } else {
                            callback(500, { 'Error': 'Could not create the new user' });
                        }
                    });
                } else {
                    callback(500, { 'Error': 'Could not hash the user\'s password.' });
                }

            } else {
                // User alread exists
                callback(400, { 'Error': 'A user with that email address already exists' });
            }
        });

    } else {
        callback(400, { 'Error': 'Missing required fields' });
    }

};

// Required data: email
// Optional data: none
handlers._users.get = function (data, callback) {
    // Check that email address is valid
    var email = typeof (data.queryStringObject.email) == 'string' && data.queryStringObject.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.queryStringObject.email.trim() : false;
    if (email) {

        // Get token from headers
        var token = typeof (data.headers.token) == 'string' ? data.headers.token : false;
        // Verify that the given token is valid for the email address
        handlers._tokens.verifyToken(token, email, function (tokenIsValid) {
            if (tokenIsValid) {
                // Lookup the user
                _data.read('users', email, function (err, data) {
                    if (!err && data) {
                        // Remove the hashed password from the user user object before returning it to the requester
                        delete data.hashedPassword;
                        callback(200, data);
                    } else {
                        callback(404);
                    }
                });
            } else {
                callback(403, { "Error": "Missing required token in header, or token is invalid." })
            }
        });
    } else {
        callback(400, { 'Error': 'Missing required field' })
    }
};

// Required data: email
// Optional data: name, email, address password (at least one must be specified)
handlers._users.put = function (data, callback) {
    // Check for required field
    var email = typeof (data.payload.email) == 'string' && data.payload.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.payload.email.trim() : false;

    // Check for optional fields
    var name = typeof (data.payload.name) == 'string' && data.payload.name.trim().length > 0 ? data.payload.name.trim() : false;
    var address = typeof (data.payload.address) == 'string' && data.payload.address.trim().length > 0 ? data.payload.address.trim() : false;
    var password = typeof (data.payload.password) == 'string' && data.payload.password.trim().length > 0 ? data.payload.password.trim() : false;

    // Error if email is invalid
    if (email) {
        // Error if nothing is sent to update
        if (name || address || password) {

            // Get token from headers
            var token = typeof (data.headers.token) == 'string' ? data.headers.token : false;

            // Verify that the given token is valid for the email address
            handlers._tokens.verifyToken(token, email, function (tokenIsValid) {
                if (tokenIsValid) {

                    // Lookup the user
                    _data.read('users', email, function (err, userData) {
                        if (!err && userData) {
                            // Update the fields if necessary
                            if (name) {
                                userData.name = name;
                            }
                            if (address) {
                                userData.address = address;
                            }
                            if (password) {
                                userData.hashedPassword = helpers.hash(password);
                            }
                            // Store the new updates
                            _data.update('users', email, userData, function (err) {
                                if (!err) {
                                    callback(200);
                                } else {
                                    callback(500, { 'Error': 'Could not update the user.' });
                                }
                            });
                        } else {
                            callback(400, { 'Error': 'Specified user does not exist.' });
                        }
                    });
                } else {
                    callback(403, { "Error": "Missing required token in header, or token is invalid." });
                }
            });
        } else {
            callback(400, { 'Error': 'Missing fields to update.' });
        }
    } else {
        callback(400, { 'Error': 'Missing required field.' });
    }

};

// Required data: email
// Cleanup old checks associated with the user
handlers._users.delete = function (data, callback) {
    // Check that email address is valid
    var email = typeof (data.queryStringObject.email) == 'string' && data.queryStringObject.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.queryStringObject.email.trim() : false;
    if (email) {

        // Get token from headers
        var token = typeof (data.headers.token) == 'string' ? data.headers.token : false;

        // Verify that the given token is valid for the email address
        handlers._tokens.verifyToken(token, email, function (tokenIsValid) {
            if (tokenIsValid) {
                // Lookup the user
                _data.read('users', email, function (err, userData) {
                    if (!err && userData) {
                        // Delete the user's data
                        _data.delete('users', email, function (err) {
                            if (!err) {
                                callback(200);
                                // Delete each of the checks associated with the user

                                //Delete the cart, orders and token associated with the user
                                // var userChecks = typeof (userData.checks) == 'object' && userData.checks instanceof Array ? userData.checks : [];
                                // var checksToDelete = userChecks.length;
                                // if (checksToDelete > 0) {
                                //     var checksDeleted = 0;
                                //     var deletionErrors = false;
                                //     // Loop through the checks
                                //     userChecks.forEach(function (checkId) {
                                //         // Delete the check
                                //         _data.delete('checks', checkId, function (err) {
                                //             if (err) {
                                //                 deletionErrors = true;
                                //             }
                                //             checksDeleted++;
                                //             if (checksDeleted == checksToDelete) {
                                //                 if (!deletionErrors) {
                                //                     callback(200);
                                //                 } else {
                                //                     callback(500, { 'Error': "Errors encountered while attempting to delete all of the user's checks. All checks may not have been deleted from the system successfully." })
                                //                 }
                                //             }
                                //         });
                                //     });
                                // } else {
                                //     callback(200);
                                // }
                            } else {
                                callback(500, { 'Error': 'Could not delete the specified user' });
                            }
                        });
                    } else {
                        callback(400, { 'Error': 'Could not find the specified user.' });
                    }
                });
            } else {
                callback(403, { "Error": "Missing required token in header, or token is invalid." });
            }
        });
    } else {
        callback(400, { 'Error': 'Missing required field' })
    }
};

// Tokens
handlers.tokens = function (data, callback) {
    var acceptableMethods = ['post', 'get', 'put', 'delete'];
    if (acceptableMethods.indexOf(data.method) > -1) {
        handlers._tokens[data.method](data, callback);
    } else {
        callback(405);
    }
};

// Container for all the tokens methods
handlers._tokens = {};

// Tokens - post
// Required data: email, password
// Optional data: none
handlers._tokens.post = function (data, callback) {
    var email = typeof (data.payload.email) == 'string' && data.payload.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.payload.email.trim() : false;
    var password = typeof (data.payload.password) == 'string' && data.payload.password.trim().length > 0 ? data.payload.password.trim() : false;
    if (email && password) {
        // Lookup the user who matches that email address
        _data.read('users', email, function (err, userData) {
            if (!err && userData) {
                // Hash the sent password, and compare it to the password stored in the user object
                var hashedPassword = helpers.hash(password);
                if (hashedPassword == userData.hashedPassword) {
                    // If valid, create a new token with a random name. Set an expiration date 1 hour in the future.
                    var tokenId = helpers.createRandomString(20);
                    var expires = Date.now() + 1000 * 60 * 60;
                    var tokenObject = {
                        'email': email,
                        'id': tokenId,
                        'expires': expires
                    };

                    // Store the token
                    _data.create('tokens', tokenId, tokenObject, function (err) {
                        if (!err) {
                            callback(200, tokenObject);
                        } else {
                            callback(500, { 'Error': 'Could not create the new token' });
                        }
                    });
                } else {
                    callback(400, { 'Error': 'Password did not match the specified user\'s stored password' });
                }
            } else {
                callback(400, { 'Error': 'Could not find the specified user.' });
            }
        });
    } else {
        callback(400, { 'Error': 'Missing required field(s).' })
    }
};

// Tokens - get
// Required data: id
// Optional data: none
handlers._tokens.get = function (data, callback) {
    // Check that id is valid
    var id = typeof (data.queryStringObject.id) == 'string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
    if (id) {
        // Lookup the token
        _data.read('tokens', id, function (err, tokenData) {
            if (!err && tokenData) {
                callback(200, tokenData);
            } else {
                callback(404);
            }
        });
    } else {
        callback(400, { 'Error': 'Missing required field, or field invalid' })
    }
};

// Tokens - put
// Required data: id, extend
// Optional data: none
handlers._tokens.put = function (data, callback) {
    var id = typeof (data.payload.id) == 'string' && data.payload.id.trim().length == 20 ? data.payload.id.trim() : false;
    var extend = typeof (data.payload.extend) == 'boolean' && data.payload.extend == true ? true : false;
    if (id && extend) {
        // Lookup the existing token
        _data.read('tokens', id, function (err, tokenData) {
            if (!err && tokenData) {
                // Check to make sure the token isn't already expired
                if (tokenData.expires > Date.now()) {
                    // Set the expiration an hour from now
                    tokenData.expires = Date.now() + 1000 * 60 * 60;
                    // Store the new updates
                    _data.update('tokens', id, tokenData, function (err) {
                        if (!err) {
                            callback(200);
                        } else {
                            callback(500, { 'Error': 'Could not update the token\'s expiration.' });
                        }
                    });
                } else {
                    callback(400, { "Error": "The token has already expired, and cannot be extended." });
                }
            } else {
                callback(400, { 'Error': 'Specified user does not exist.' });
            }
        });
    } else {
        callback(400, { "Error": "Missing required field(s) or field(s) are invalid." });
    }
};


// Tokens - delete
// Required data: id
// Optional data: none
handlers._tokens.delete = function (data, callback) {
    // Check that id is valid
    var id = typeof (data.queryStringObject.id) == 'string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
    if (id) {
        // Lookup the token
        _data.read('tokens', id, function (err, tokenData) {
            if (!err && tokenData) {
                // Delete the token
                _data.delete('tokens', id, function (err) {
                    if (!err) {
                        callback(200);
                    } else {
                        callback(500, { 'Error': 'Could not delete the specified token' });
                    }
                });
            } else {
                callback(400, { 'Error': 'Could not find the specified token.' });
            }
        });
    } else {
        callback(400, { 'Error': 'Missing required field' })
    }
};

// Verify if a given token id is currently valid for a given user
handlers._tokens.verifyToken = function (id, email, callback) {
    // Lookup the token
    _data.read('tokens', id, function (err, tokenData) {
        if (!err && tokenData) {
            // Check that the token is for the given user and has not expired
            if (tokenData.email == email && tokenData.expires > Date.now()) {
                callback(true);
            } else {
                callback(false);
            }
        } else {
            callback(false);
        }
    });
};


// Orders

// Container for all the users methods
handlers._orders = {};

handlers.orders = function (data, callback) {
    var acceptableMethods = ['post', 'get', 'put', 'delete'];
    if (acceptableMethods.indexOf(data.method) > -1) {
        handlers._orders[data.method](data, callback);
    } else {
        callback(405);
    }
};

// Users - post
// Required data: email, products, total_payment
// Optional data: none
handlers._orders.post = function (data, callback) {
    // Check that all required fields are filled out
    var email = typeof (data.payload.email) == 'string' && data.payload.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.payload.email.trim() : false;
    var products = typeof (data.payload.products) == 'object' ? data.payload.products : false;
    var total_payment = typeof (data.payload.total_payment) == 'number' ? data.payload.total_payment : false;

    if (email && products && total_payment) {
        //send a post request to the stripe sandbox before stroing as an order


        var options = {
            "method": "POST",
            "hostname": "api.stripe.com",
            "path": "/v1/charges",
            "headers": {
                "Authorization": "Bearer sk_test_ItESeY6Rnc7s4aDqJ8GNUh8J",
                "Cache-Control": "no-cache",
                "Content-Type": "application/x-www-form-urlencoded"
            }
        };

        var req = https.request(options, function (res) {
            var status = res.statusCode;

            if (status == 200) {
                // Make sure the order doesnt already exist
                var order_id = helpers.createRandomString(20);
                var orderObject = {
                    'email': email,
                    'products': products,
                    'total_payment': total_payment,
                    'order_id': order_id
                }

                _data.create('orders', order_id, orderObject, function (err) {
                    if (!err) {
                        //delete the cart
                        _data.delete('carts', email, function (err) {
                            if (!err) {
                                var sendMailData = {
                                    from: "Mailgun Sandbox <postmaster@sandbox92bec566a6bd4eaea8e29eee77f100ae.mailgun.org>",
                                    to: email,
                                    subject: "Confirmation of order from the restaurant!!",
                                    text: `Thank you for the payment of $${total_payment} for your order. Enjoy you meal!`
                                }
                                var sendMailDataString = JSON.stringify(sendMailData);
                                var requestDetails = {
                                    host: 'api.mailgun.net',
                                    port: 443,
                                    path: 'v3/sandbox92bec566a6bd4eaea8e29eee77f100ae.mailgun.org/messages',
                                    method: "POST",
                                    headers: {
                                        "content-type": "multipart/form-data;",
                                        "Authorization": "Basic YXBpOmZiYmRlMjA0YzQwOWU1ODFhNWY3N2ZjYTkwMmEwNzQxLTNiMWY1OWNmLTM0MjE2OTkw",
                                        "Cache-Control": "no-cache",
                                    }
                                }
                                var req = https.request(requestDetails, function (res) {
                                    if (res.statusCode == 200) {
                                        callback(200);
                                    } else {
                                        callback(500, { 'Error': "Order places successfully but unable to send the confirmation mail" });
                                    }
                                });
                                req.write(sendMailDataString);
                                req.end();
                            } else {
                                callback(500, { 'Error': 'Could not create the new order' });
                            }
                        });
                    } else {
                        callback(500, "unable to remove user's cart");
                    }
                });
            } else {
                callback(400, { 'Error': 'Payment not successful for the order' });
            }

        });

        req.write(qs.stringify({
            amount: '999',
            currency: 'usd',
            description: 'Example charge',
            source: 'tok_visa'
        }));
        req.end();
    } else {
        callback(400, { 'Error': 'Missing required fields' });
    }

};

// Required data: email
// Optional data: none
handlers._orders.get = function (data, callback) {
    // Check that email address is valid
    var email = typeof (data.queryStringObject.email) == 'string' && data.queryStringObject.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.queryStringObject.email.trim() : false;
    var order_id = typeof (data.queryStringObject.order_id) == 'string' && data.queryStringObject.order_id.trim().length > 0 ? data.queryStringObject.order_id.trim() : false;

    if (email && order_id) {

        // Get token from headers
        var token = typeof (data.headers.token) == 'string' ? data.headers.token : false;
        // Verify that the given token is valid for the email address
        handlers._tokens.verifyToken(token, email, function (tokenIsValid) {
            if (tokenIsValid) {
                // Lookup the user
                _data.read('orders', order_id, function (err, data) {
                    if (!err && data) {
                        callback(200, data);
                    } else {
                        callback(404);
                    }
                });
            } else {
                callback(403, { "Error": "Missing required token in header, or token is invalid." })
            }
        });
    } else {
        callback(400, { 'Error': 'Missing required field' })
    }
};

// Required data: email
// Optional data: email, products, total_payment (at least one must be specified)
handlers._orders.put = function (data, callback) {
    // Check for required field
    var email = typeof (data.payload.email) == 'string' && data.payload.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.payload.email.trim() : false;
    var order_id = typeof (data.queryStringObject.order_id) == 'string' && data.queryStringObject.order_id.trim().length > 0 ? data.queryStringObject.order_id.trim() : false;

    // Check for optional fields
    var products = typeof (data.payload.products) == 'object' ? data.payload.products : false;
    var total_payment = typeof (data.payload.total_payment) == 'number' ? data.payload.total_payment : false;

    // Error if email is invalid
    if (email && order_id) {
        // Error if nothing is sent to update
        if (products || total_payment) {

            // Get token from headers
            var token = typeof (data.headers.token) == 'string' ? data.headers.token : false;

            // Verify that the given token is valid for the email address
            handlers._tokens.verifyToken(token, email, function (tokenIsValid) {
                if (tokenIsValid) {

                    // Lookup the order
                    _data.read('orders', email, function (err, orderData) {
                        if (!err && orderData) {
                            // Update the fields if necessary
                            if (products) {
                                orderData.products = products;
                            }
                            if (total_payment) {
                                orderData.total_payment = total_payment;
                            }

                            // Store the new updates
                            _data.update('orders', order_id, orderData, function (err) {
                                if (!err) {
                                    callback(200);
                                } else {
                                    callback(500, { 'Error': 'Could not update the order.' });
                                }
                            });
                        } else {
                            callback(400, { 'Error': 'Specified order does not exist.' });
                        }
                    });
                } else {
                    callback(403, { "Error": "Missing required token in header, or token is invalid." });
                }
            });
        } else {
            callback(400, { 'Error': 'Missing fields to update.' });
        }
    } else {
        callback(400, { 'Error': 'Missing required field.' });
    }

};

// Required data: email
// Cleanup old checks associated with the user
handlers._orders.delete = function (data, callback) {
    // Check that email address is valid
    var email = typeof (data.queryStringObject.email) == 'string' && data.queryStringObject.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.queryStringObject.email.trim() : false;
    var order_id = typeof (data.queryStringObject.order_id) == 'string' && data.queryStringObject.order_id.trim().length > 0 ? data.queryStringObject.order_id.trim() : false;

    if (email && order_id) {

        // Get token from headers
        var token = typeof (data.headers.token) == 'string' ? data.headers.token : false;

        // Verify that the given token is valid for the email address
        handlers._tokens.verifyToken(token, email, function (tokenIsValid) {
            if (tokenIsValid) {
                // Lookup the order
                _data.read('orders', email, function (err, orderData) {
                    if (!err && orderData) {
                        // Delete the order's data
                        _data.delete('orders', order_id, function (err) {
                            if (!err) {
                                callback(200);

                            } else {
                                callback(500, { 'Error': 'Could not delete the specified order' });
                            }
                        });
                    } else {
                        callback(400, { 'Error': 'Could not find the specified order.' });
                    }
                });
            } else {
                callback(403, { "Error": "Missing required token in header, or token is invalid." });
            }
        });
    } else {
        callback(400, { 'Error': 'Missing required field' })
    }
};



//Cart of the user

// Container for all the users methods
handlers._carts = {};

handlers.carts = function (data, callback) {
    var acceptableMethods = ['post', 'get', 'put', 'delete'];
    if (acceptableMethods.indexOf(data.method) > -1) {
        handlers._carts[data.method](data, callback);
    } else {
        callback(405);
    }
};

// Users - post
// Required data: email, products, total_payment
// Optional data: none
handlers._carts.post = function (data, callback) {
    // Check that all required fields are filled out
    var email = typeof (data.payload.email) == 'string' && data.payload.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.payload.email.trim() : false;
    var products = typeof (data.payload.products) == 'object' ? data.payload.products : false;
    var total_payment = typeof (data.payload.total_payment) == 'number' ? data.payload.total_payment : false;

    if (email && products && total_payment) {
        // Make sure the user doesnt already exist
        _data.read('carts', email, function (err, data) {
            if (err) {

                //create the order object
                var cartObject = {
                    'email': email,
                    'products': products,
                    'total_payment': total_payment
                }

                _data.create('carts', email, cartObject, function (err) {
                    if (!err) {
                        callback(200);
                    } else {
                        callback(500, { 'Error': 'Could not create the new order' });
                    }
                });

            } else {
                // User alread exists
                callback(400, { 'Error': 'A cart with that email address already exists' });
            }
        });

    } else {
        callback(400, { 'Error': 'Missing required fields' });
    }

};

// Required data: email
// Optional data: none
handlers._carts.get = function (data, callback) {
    // Check that email address is valid
    var email = typeof (data.queryStringObject.email) == 'string' && data.queryStringObject.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.queryStringObject.email.trim() : false;
    if (email) {

        // Get token from headers
        var token = typeof (data.headers.token) == 'string' ? data.headers.token : false;
        // Verify that the given token is valid for the email address
        handlers._tokens.verifyToken(token, email, function (tokenIsValid) {
            if (tokenIsValid) {
                // Lookup the user
                _data.read('carts', email, function (err, data) {
                    if (!err && data) {
                        callback(200, data);
                    } else {
                        callback(404);
                    }
                });
            } else {
                callback(403, { "Error": "Missing required token in header, or token is invalid." })
            }
        });
    } else {
        callback(400, { 'Error': 'Missing required field' })
    }
};

// Required data: email
// Optional data: email, products, total_payment (at least one must be specified)
handlers._carts.put = function (data, callback) {
    // Check for required field
    var email = typeof (data.payload.email) == 'string' && data.payload.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.payload.email.trim() : false;

    // Check for optional fields
    var products = typeof (data.payload.products) == 'object' && data.payload.products.trim().length > 0 ? data.payload.products.trim() : false;
    var total_payment = typeof (data.payload.total_payment) == 'number' && data.payload.total_payment.trim().length > 0 ? data.payload.total_payment.trim() : false;

    // Error if email is invalid
    if (email) {
        // Error if nothing is sent to update
        if (products || total_payment) {

            // Get token from headers
            var token = typeof (data.headers.token) == 'string' ? data.headers.token : false;

            // Verify that the given token is valid for the email address
            handlers._tokens.verifyToken(token, email, function (tokenIsValid) {
                if (tokenIsValid) {

                    // Lookup the user
                    _data.read('carts', email, function (err, orderData) {
                        if (!err && orderData) {
                            // Update the fields if necessary
                            if (products) {
                                orderData.products = products;
                            }
                            if (total_payment) {
                                orderData.total_payment = total_payment;
                            }

                            // Store the new updates
                            _data.update('carts', email, orderData, function (err) {
                                if (!err) {
                                    callback(200);
                                } else {
                                    callback(500, { 'Error': 'Could not update the cart.' });
                                }
                            });
                        } else {
                            callback(400, { 'Error': 'Specified cart does not exist.' });
                        }
                    });
                } else {
                    callback(403, { "Error": "Missing required token in header, or token is invalid." });
                }
            });
        } else {
            callback(400, { 'Error': 'Missing fields to update.' });
        }
    } else {
        callback(400, { 'Error': 'Missing required field.' });
    }

};

// Required data: email
// Cleanup old checks associated with the user
handlers._carts.delete = function (data, callback) {
    // Check that email address is valid
    var email = typeof (data.queryStringObject.email) == 'string' && data.queryStringObject.email.trim().match(/\S+@\S+\.\S+/).length > 0 ? data.queryStringObject.email.trim() : false;
    if (email) {

        // Get token from headers
        var token = typeof (data.headers.token) == 'string' ? data.headers.token : false;

        // Verify that the given token is valid for the email address
        handlers._tokens.verifyToken(token, email, function (tokenIsValid) {
            if (tokenIsValid) {
                // Lookup the user
                _data.read('users', email, function (err, cartData) {
                    if (!err && cartData) {
                        // Delete the user's data
                        _data.delete('carts', email, function (err) {
                            if (!err) {
                                callback(200);
                                // Delete each of the checks associated with the user

                                //Delete the cart, orders and token associated with the user
                                // var userChecks = typeof (userData.checks) == 'object' && userData.checks instanceof Array ? userData.checks : [];
                                // var checksToDelete = userChecks.length;
                                // if (checksToDelete > 0) {
                                //     var checksDeleted = 0;
                                //     var deletionErrors = false;
                                //     // Loop through the checks
                                //     userChecks.forEach(function (checkId) {
                                //         // Delete the check
                                //         _data.delete('checks', checkId, function (err) {
                                //             if (err) {
                                //                 deletionErrors = true;
                                //             }
                                //             checksDeleted++;
                                //             if (checksDeleted == checksToDelete) {
                                //                 if (!deletionErrors) {
                                //                     callback(200);
                                //                 } else {
                                //                     callback(500, { 'Error': "Errors encountered while attempting to delete all of the user's checks. All checks may not have been deleted from the system successfully." })
                                //                 }
                                //             }
                                //         });
                                //     });
                                // } else {
                                //     callback(200);
                                // }
                            } else {
                                callback(500, { 'Error': 'Could not delete the specified order' });
                            }
                        });
                    } else {
                        callback(400, { 'Error': 'Could not find the specified order.' });
                    }
                });
            } else {
                callback(403, { "Error": "Missing required token in header, or token is invalid." });
            }
        });
    } else {
        callback(400, { 'Error': 'Missing required field' })
    }
};

module.exports = handlers;

