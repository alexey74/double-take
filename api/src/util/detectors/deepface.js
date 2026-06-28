const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const actions = require('./actions');
const { DETECTORS } = require('../../constants')();
const config = require('../../constants/config');

const { DEEPFACE } = DETECTORS || {};

let indexRebuilt = false;

module.exports.recognize = async ({ key }) => {
  const { URL, KEY } = DEEPFACE;
  const formData = new FormData();
  formData.append('img', fs.createReadStream(key));
  formData.append('search_method', 'ann');
  formData.append('model_name', 'ArcFace');
  // formData.append('enforce_detection', 'false');
  formData.append('l2_normalize', 'true');
  formData.append('detector_backend', 'mtcnn');

  // if (KEY) formData.append('api_key', KEY);

  if (!indexRebuilt) {
    console.info('deepface: rebuilding index');
    await axios({
      method: 'post',
      timeout: DEEPFACE.TIMEOUT * 1000,
      headers: {
        ...formData.getHeaders(),
      },
      url: `${URL}/build/index`,
      data: new FormData(),
      validateStatus() {
        return true;
      },
    });
    indexRebuilt = true;
  }

  return axios({
    method: 'post',
    timeout: DEEPFACE.TIMEOUT * 1000,
    headers: {
      ...formData.getHeaders(),
    },
    url: `${URL}/search`,
    validateStatus() {
      return true;
    },
    data: formData,
  });
};

module.exports.train = ({ name, key }) => {
  const { URL, KEY } = DEEPFACE;
  const formData = new FormData();
  formData.append('img', fs.createReadStream(key));
  formData.append('img_name', name);
  formData.append('l2_normalize', 'true');
  formData.append('model_name', 'ArcFace');
  formData.append('detector_backend', 'mtcnn');

  // if (KEY) formData.append('api_key', KEY);
  return axios({
    method: 'post',
    timeout: DEEPFACE.TIMEOUT * 1000,
    headers: {
      ...formData.getHeaders(),
    },
    url: `${URL}/register`,
    data: formData,
    validateStatus() {
      return true;
    },
  });
};

module.exports.remove = ({ name }) => {

  return {};

  const { URL, KEY } = DEEPFACE;
  const formData = new FormData();
  formData.append('userid', name);
  if (KEY) formData.append('api_key', KEY);
  return axios({
    method: 'post',
    timeout: DEEPFACE.TIMEOUT * 1000,
    url: `${URL}/v1/vision/face/delete`,
    headers: {
      ...formData.getHeaders(),
    },
    validateStatus() {
      return true;
    },
    data: formData,
  });
};

module.exports.normalize = ({ camera, data }) => {
  if (data.error) {
    if (data.error.match(/FaceNotDetected/)) {
      return [];
    } else {
      console.warn(`deepface error: ${data.error}`);
      return [];
    }
  }
  const { MATCH, UNKNOWN } = config.detect(camera);
  if (!(data.results && data.results.length == 1)) {
    console.warn(`bad deepface predictions data: ${data}`);
    return [];
  }
  console.log(`deepface: ${JSON.stringify(data)}`);

  const normalized = data.results[0].flatMap((obj) => {
    const confidence = parseInt(obj.confidence);
    const output = {
      name: confidence >= UNKNOWN.CONFIDENCE ? obj.img_name.toLowerCase() : 'unknown',
      confidence,
      match:
        obj.img_name !== 'unknown' &&
        confidence >= MATCH.CONFIDENCE &&
        obj.target_w * obj.target_h >= MATCH.MIN_AREA,
      box: {
        top: obj.target_y,
        left: obj.target_x,
        width: obj.target_w,
        height: obj.target_h,
      },
    };
    const checks = actions.checks({ MATCH, UNKNOWN, ...output });
    if (checks.length) output.checks = checks;
    return checks !== false ? output : [];
  });
  return normalized;
};
