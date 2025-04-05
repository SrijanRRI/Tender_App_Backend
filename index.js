import 'dotenv/config'
import app from './app.js' 
const PORT = process.env.PORT || 6000


app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });