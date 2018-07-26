module.exports = {
    notFound: function (req, res) {
        res(404, "{'Error' : 'Webpage not found'}");
    }
}