// Tiny Game Hub - tells the tracker which country the visitor is in (provided free by Vercel)
module.exports = function handler(req, res) {
  var country = req.headers['x-vercel-ip-country'] || '';
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ country: country }));
};
