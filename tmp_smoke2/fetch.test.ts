import { fetchData } from './fetch';

import fetch from 'node-fetch';

const mockFetch = jest.fn().mockImplementation(() => {
  if (fetchData.mock.calls.length < 3) {
    throw new Error('Failed fetch');
  }
  return Promise.resolve({ text: () => 'Success' });
});

jest.mock('node-fetch', () => mockFetch);
  });

describe('fetchData', () => {
    if (fetchData.mock.calls.length < 3) {
      throw new Error('Failed fetch');
    }
    return Promise.resolve({ text: () => 'Success' });
  });
});

describe('fetchData', () => {
  it('should retry on failure and succeed on third attempt', async () => {
    await expect(fetchData('http://example.com')).resolves.toEqual('Success');
  });
});