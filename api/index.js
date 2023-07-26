const { createProxyMiddleware } = require("http-proxy-middleware");
const IP_RANGE = [
  ['3.2.50.0', '3.5.31.255'], //192,000
  ['3.12.0.0', '3.23.255.255'], //786,432
  ['3.30.0.0', '3.33.34.255'], //205,568
  ['3.40.0.0', '3.63.255.255'], //1,572,864
  ['3.80.0.0', '3.95.255.255'], //1,048,576
  ['3.100.0.0', '3.103.255.255'], //262,144
  ['3.116.0.0', '3.119.255.255'], //262,144
  ['3.128.0.0', '3.247.255.255'], //7,864,320
];

/**
 * 随机整数 [min,max)
 * @param {number} min
 * @param {number} max
 * @returns
 */
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min)) + min;

/**
 * ip 转 int
 * @param {string} ip
 * @returns
 */
const ipToInt = (ip) => {
  const ipArr = ip.split('.');
  let result = 0;
  result += +ipArr[0] << 24;
  result += +ipArr[1] << 16;
  result += +ipArr[2] << 8;
  result += +ipArr[3];
  return result;
};

/**
 * int 转 ip
 * @param {number} intIP
 * @returns
 */
const intToIp = (intIP) => {
  return `${(intIP >> 24) & 255}.${(intIP >> 16) & 255}.${(intIP >> 8) & 255}.${intIP & 255}`;
};

const getRandomIP = () => {
  const randIndex = getRandomInt(0, IP_RANGE.length);
  const startIp = IP_RANGE[randIndex][0];
  const endIp = IP_RANGE[randIndex][1];
  const startIPInt = ipToInt(startIp);
  const endIPInt = ipToInt(endIp);
  const randomInt = getRandomInt(startIPInt, endIPInt);
  const randomIP = intToIp(randomInt);
  return randomIP;
};

/**
 * 将通配符字符串转换成正则表达式，支持 ? 和 * 通配符
 * @param {String} wildcardString 通配符字符串
 * @returns {RegExp} 转换后的正则表达式
 */
function convertWildcardToRegExp(wildcardString) {
  const escapedString = wildcardString
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '.')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escapedString}$`);
}

/**
 * 验证请求的 Origin 是否允许访问本服务
 * @param {Object} req 请求对象
 * @returns {Boolean} 是否允许访问
 */
const validateOrigin = (req) => {
  // 允许的 Origin 列表，支持通配符，如果不设置，则不做限制
  const domains = process.env.ALLOWED_ORIGIN || '';
  const regList = (domains && domains.trim()) ? domains.trim().split(',') : [];
  if (regList.length == 0) {
    console.log("No allowed origin is set, all origins are allowed.");
    return true;
  }
  const regexpArr = regList.map((regStr) => new RegExp(convertWildcardToRegExp(regStr.trim())));
  const origin = req.headers.origin;
  console.log(`Request origin: ${origin}`);
  if (origin) {
    for (let i = 0; i < regexpArr.length; i++) {
      if (regexpArr[i].exec(origin)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 代理 OpenAI API 请求
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 * @param {Function} next 后续处理函数
 */
module.exports = async function openAIProxy(req, res, next) {
  let target = '';
  let openApiKey = process.env.OPENAI_API_KEY || '';
  let ApiUrl = process.env.API_URL || 'https://chimeragpt.adventblocks.cc';
  const randIP = getRandomIP();
  if (validateOrigin(req)) {
    const options = {
      target: ApiUrl,
      changeOrigin: true,
      pathRewrite: {
        "^/api": "" // strip "/api" from the URL
      },
      onProxyRes: function (proxyRes, req, res) {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      },
    };
    if (openApiKey !== '') {
      options.headers = {
        'X-Forwarded-For': randIP,
        Authorization: `Bearer ${openApiKey}`
      };
    }
    return createProxyMiddleware(options)(req, res, next);
  }
  else {
    res.statusCode = 403;
    // 构造一个符合规范的 JSON 格式数据
    const data = {
      "id": "403",
      "object": "chat.completion",
      "created": Date.now() / 1000,
      "model": "gpt-3.5-turbo-0301",
      "usage": {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0
      },
      "choices": [
        {
          "message": {
            "role": "assistant",
            "content": "REQUEST NOT ALLOWED!"
          },
          "finish_reason": "stop",
          "index": 0
        }
      ]
    };
    res.json(data);
  }
}
