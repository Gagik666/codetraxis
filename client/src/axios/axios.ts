import axios from 'axios';

export const smartAxios = axios.create();

smartAxios.interceptors.request.use(
  (request) => {
    if (!request.baseURL) {
      request.baseURL = '/';
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    request.headers['User-Timezone'] = timeZone;
    return request;
  },
  (error) => Promise.reject(error)
);

smartAxios.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);
