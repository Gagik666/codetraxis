import { createAsyncThunk } from '@reduxjs/toolkit';
import { getFileContent } from '../../axios/tree/treeService';

export const getFileContentThunk = createAsyncThunk(
    'file/getContent',
    async (filePath: string, { rejectWithValue }) => {
        try {
            const response = await getFileContent(filePath);
            return response.data;
        } catch {
            return rejectWithValue('Failed to fetch file content');
        }
    }
);
