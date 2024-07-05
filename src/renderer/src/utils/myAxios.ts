import axios from 'axios'

const isDev = process.env.NODE_ENV === 'development'

const myAxios = axios.create({
  baseURL: isDev ? 'http://127.0.0.1:5000' : '线上地址'
})

// myAxios.defaults.withCredentials = true // 配置为true

// Add a request interceptor
myAxios.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
)

// Add a response interceptor
myAxios.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error)
)

export default myAxios
