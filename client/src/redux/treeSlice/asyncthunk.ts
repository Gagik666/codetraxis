import { createAsyncThunk } from '@reduxjs/toolkit';
import { getAppTree } from '../../axios/tree/treeService';


export const getAppTreeThunk = createAsyncThunk(
  'auth/getAppTree',
  async (_, { rejectWithValue }) => {
    try {
      const response = await getAppTree();
      return response.data;
    } catch (error) {
      return rejectWithValue('Failed to fetch tree data');
    }
  }
);




