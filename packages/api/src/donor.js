// Donor API calls — shared between web and mobile
import axios from 'axios';

export const getDonors = () => axios.get('/api/donors');
export const registerDonor = (data) => axios.post('/api/donors', data);
