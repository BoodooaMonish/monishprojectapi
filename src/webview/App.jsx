import React, { useState, useEffect } from 'react';
import { Homepage, Settingpage, Addnewprojectpage } from "./Pages";
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;


const sortByFavorite = (projectList) => {
  let tempProjectList = projectList;
  tempProjectList.sort((a, b) => (b.favorite || 0) - (a.favorite || 0));
  return tempProjectList;
};

const sortByLatestDate = (projectList) => {
  let tempProjectList = projectList;
  tempProjectList.sort((a, b) => Date.parse(b.lastAccess) - Date.parse(a.lastAccess));
  return tempProjectList
};

export default function App() {
  const [currentPage, setCurrentPage] = useState('homepage');
  const [apiData, setApiData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Hook to handle background communications from the view interface to the vscode server (extension.js)
  useEffect(() => {
    const handleMessage = (event) => {
      const message = event.data;
      if (message.command === 'navigate') {
        setCurrentPage(message.page);
      }
      if ('apidata' in message) {
        setApiData(message.apidata);
      }

      if ('projects' in message) {
        setProjects(sortByFavorite(sortByLatestDate(message.projects)));
      }

      if (message.command === 'getInitData') {
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);

    vscode.postMessage({ command: 'fetchInitData' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (loading) return (<div class="center">Loading Data...</div>);

  return (
    <div className='monishprojectapi_wrapper'>
      {currentPage === 'homepage' ? <Homepage onChangePage={setCurrentPage} vscode={vscode} projects={projects} /> : ''}
      {currentPage === 'settings' ? <Settingpage onChangePage={setCurrentPage} vscode={vscode} apidata={apiData} /> : ''}
      {currentPage === 'addnewproject' ? <Addnewprojectpage onChangePage={setCurrentPage} vscode={vscode} /> : ''}
    </div>
  )
}