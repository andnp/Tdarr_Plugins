/* eslint-disable no-await-in-loop */
module.exports.dependencies = ['axios@0.27.2', '@cospired/i18n-iso-languages'];
// tdarrSkipTest
const details = () => ({
  id: 'custom_remove_langs',
  Stage: 'Pre-processing',
  Name: 'Custom - Remove all langs except native and English',
  Type: 'Audio',
  Operation: 'Transcode',
  Description: `This plugin will remove all language audio tracks except the 'native'
     (requires TMDB api key) and English.
    'Native' languages are the ones that are listed on imdb. It does an API call to
    Radarr, Sonarr to check if the movie/series exists and grabs the IMDB id. As a last resort it
    falls back to the IMDB id in the filename.`,
  Version: '1.02',
  Tags: 'pre-processing,configurable',
  Inputs: [
    {
      name: 'user_langs',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Input a comma separated list of ISO-639-2 languages. It will still keep English and undefined tracks.'
        + '(https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes 639-2 column)'
        + '\\nExample:\\n'
        + 'nld,nor',
    },
    {
      name: 'priority',
      type: 'string',
      defaultValue: 'radarr',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Priority for either radarr or sonarr. Leaving it empty defaults to radarr first.'
        + '\\nExample:\\n'
        + 'sonarr',
    },
    {
      name: 'api_key',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Input your TMDB api (v3) key here. (https://www.themoviedb.org/)',
    },
    {
      name: 'radarr_api_key',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Input your Radarr api key here.',
    },
    {
      name: 'radarr_url',
      type: 'string',
      defaultValue: '192.168.1.2:7878',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Input your Radarr url here. (Without http://). Do include the port.'
        + '\\nExample:\\n'
        + '192.168.1.2:7878',
    },
    {
      name: 'sonarr_api_key',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Input your Sonarr api key here.',
    },
    {
      name: 'sonarr_url',
      type: 'string',
      defaultValue: '192.168.1.2:8989',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Input your Sonarr url here. (Without http://). Do include the port.'
        + '\\nExample:\\n'
        + '192.168.1.2:8989',
    },
  ],
});
const response = {
  processFile: false,
  preset: ', -map 0 ',
  container: '.',
  handBrakeMode: false,
  FFmpegMode: true,
  reQueueAfter: false,
  infoLog: '',
};

const errorHandler = (ret) => {
  const handle = (err) => {
    if (err.response) {
      response.infoLog += `Error: ${err.response.status} \n`;
      response.infoLog += `${err.response.data} \n`;
    } else {
      response.infoLog += `Error: ${err.message} \n`;
    }
    return ret;
  }
  return handle;
}

const processStreams = (result, file, user_langs) => {
  // eslint-disable-next-line import/no-unresolved
  const languages = require('@cospired/i18n-iso-languages');
  const tracks = {
    keep: [],
    remove: [],
    remLangs: '',
  };
  let streamIndex = 0;

  // If the original language is pulled as Chinese 'cn' is used.  iso-language expects 'zh' for Chinese.
  const langsTemp = result.original_language === 'cn' ? 'zh' : result.original_language;

  let langs = [];

  langs.push(languages.alpha2ToAlpha3B(langsTemp));

  // Some console reporting for clarification of what the plugin is using and reporting.
  response.infoLog += `Original language: ${langsTemp}, Using code: ${languages.alpha2ToAlpha3B(langsTemp)}\n`;

  if (user_langs) {
    langs = langs.concat(user_langs);
  }
  if (!langs.includes('eng')) langs.push('eng');
  if (!langs.includes('und')) langs.push('und');

  response.infoLog += 'Keeping languages: ';
  // Print languages to UI
  langs.forEach((l) => {
    response.infoLog += `${languages.getName(l, 'en')}, `;
  });

  response.infoLog = `${response.infoLog.slice(0, -2)}\n`;

  for (let i = 0; i < file.ffProbeData.streams.length; i += 1) {
    const stream = file.ffProbeData.streams[i];

    if (stream.codec_type === 'audio') {
      if (!stream.tags) {
        response.infoLog += `☒No tags found on audio track ${streamIndex}. Keeping it. \n`;
        tracks.keep.push(streamIndex);
        streamIndex += 1;
        // eslint-disable-next-line no-continue
        continue;
      }
      if (stream.tags.language) {
        if (langs.includes(stream.tags.language)) {
          tracks.keep.push(streamIndex);
        } else {
          tracks.remove.push(streamIndex);
          response.preset += `-map -0:a:${streamIndex} `;
          tracks.remLangs += `${languages.getName(stream.tags.language, 'en')}, `;
        }
        streamIndex += 1;
      } else {
        response.infoLog += `☒No language tag found on audio track ${streamIndex}. Keeping it. \n`;
      }
    }
  }
  response.preset += ' -c copy -max_muxing_queue_size 9999';
  return tracks;
};

const tmdbApi = async (filename, api_key, axios) => {
  let fileName;
  // If filename begins with tt, it's already an imdb id
  if (filename) {
    if (filename.substr(0, 2) === 'tt') {
      fileName = filename;
    } else {
      const idRegex = /(tt\d{7,8})/;
      const fileMatch = filename.match(idRegex);
      // eslint-disable-next-line prefer-destructuring
      if (fileMatch) fileName = fileMatch[1];
    }
  }

  if (fileName) {
    const url = `https://api.themoviedb.org/3/find/${fileName}?api_key=${api_key}&language=en-US&external_source=imdb_id`;
    const result = await axios.get(url)
      .then((resp) => (resp.data.movie_results.length > 0 ? resp.data.movie_results[0] : resp.data.tv_results[0]))
      .catch(errorHandler(null));

    if (!result) {
      response.infoLog += '☒No IMDB result was found. \n';
    }
    return result;
  }
};

const getRadarrResult = async (file, inputs) => {
  if (!inputs.radarr_api_key) return null;

  const api_response = await axios.get(`http://${inputs.radarr_url}/api/v3/movie?apiKey=${inputs.radarr_api_key}`)
    .then(resp => resp.data)
    .catch(errorHandler([]));

  const movies = api_response
    .filter(movie => movie.movieFile)
    .filter(movie => movie.movieFile.relativePath)
    .filter(movie => movie.movieFile.relativePath === file.meta.FileName);

  if (movies.length === 0) {
    response.infoLog += 'Couldn\'t grab ID from Radarr \n';
    return null;
  }
  if (movies.length > 1) {
    response.infoLog += `Warning: found multiple matching movies from Radarr \n`;
  }

  const movie = movies[0];
  response.infoLog += `Grabbed ID (${movie.imdbId}) from Radarr \n`;
  return movie.imdbId;
};

const getSonarrResult = async (file, inputs) => {
  if (!inputs.sonarr_api_key) return null;
  let api_response = await axios.get(`http://${inputs.sonarr_url}/api/series?apikey=${inputs.sonarr_api_key}`)
    .then(resp => resp.data)
    .catch(errorHandler(null));

  // try again using Sonarr v4's api
  if (!api_response) {
    api_response = await axios.get(`http://${inputs.sonarr_url}/api/v3/series?apikey=${inputs.sonarr_api_key}`)
    .then(resp => resp.data)
    .catch(errorHandler([]));
  }

  let result = null;
  for (const show of api_response) {
    if (show.path) {
      const sonarrTemp = show.path.replace(/\\/g, '/').split('/');
      const sonarrFolder = sonarrTemp[sonarrTemp.length - 1];
      const tdarrTemp = filePath.split('/');
      const tdarrFolder = tdarrTemp[tdarrTemp.length - 2];
      if (sonarrFolder === tdarrFolder) {
        result = show;
        break;
      }
    }
  }

  if (!result) {
    response.infoLog += 'Couldn\'t grab ID from Sonarr \n';
    return null;
  }

  response.infoLog += `Grabbed ID (${result.imdbId}) from Sonarr \n`;
  return result.imdbId;
};

// eslint-disable-next-line no-unused-vars
const plugin = async (file, librarySettings, inputs, otherArguments) => {
  const lib = require('../methods/lib')();
  // eslint-disable-next-line no-unused-vars,no-param-reassign
  inputs = lib.loadDefaultValues(inputs, details);
  // eslint-disable-next-line import/no-unresolved
  const axios = require('axios').default;
  response.container = `.${file.container}`;

  const priorities =
    inputs.priority === 'sonarr' ? ['sonarr', 'radarr', 'imdb']
    : inputs.priority === 'radarr'? ['radarr', 'sonarr', 'imdb']
    : inputs.priority === 'imdb' ? ['imdb', 'radarr', 'sonarr']
    : ['radarr', 'sonarr', 'imdb'];

  let imdbId = null;
  for (const strategy of priorities) {
    switch (strategy) {
      case 'radarr':
        imdbId = await getRadarrResult(file, inputs);

      case 'sonarr':
        imdbId = await getSonarrResult(file, inputs);

      case 'imdb':
        imdbId = file.meta.FileName;
    }

    if (imdbId) break;
  }

  if (!imdbId) {
    response.infoLog += 'Failed to find imdbId \n';
    return response;
  }

  const tmdbResult = await tmdbApi(imdbId, inputs.api_key, axios)
    .catch(errorHandler(null));

    if (!tmdbResult) {
    response.infoLog += '☒Couldn\'t find the IMDB id of this file. Skipping. \n';
    return response;
  }

  const tracks = processStreams(tmdbResult, file, inputs.user_langs ? inputs.user_langs.split(',') : '');
  if (tracks.remove.length > 0 && tracks.keep.length > 0) {
    response.infoLog += `☑Removing tracks with languages: ${tracks.remLangs.slice(0, -2)}. \n`;
    response.processFile = true;
    response.infoLog += '\n';
  } else if (tracks.remove.length > 0 && tracks.keep.length == 0) {
    response.infoLog += '☒Cancelling plugin otherwise all audio tracks would be removed. \n';
  } else if (tracks.remove.length == 0) {
    response.infoLog += '☒No audio tracks to be removed. \n';
  } else {
    response.infoLog += 'Unknown error occurred. Not removing tracks. \n';
  }

  return response;
};

module.exports.details = details;
module.exports.plugin = plugin;
