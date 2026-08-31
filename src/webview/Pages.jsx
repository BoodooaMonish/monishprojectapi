import { VSCodeButton, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { useMemo, useState } from 'react';


export function Homepage({ onChangePage, vscode, projects }) {
  const [inputSearch, setinputSearch] = useState('');
  const [updateOpened, setupdateOpened] = useState('');

  const renderProjects = useMemo(() => {
    if (projects.length == 0) return projects;
    if (!inputSearch) return projects;
    if (inputSearch.length <= 3) return projects;

    return projects.filter(prog => {
      return prog.title.toLowerCase().includes(inputSearch.toLowerCase()) || prog.path.toLowerCase().includes(inputSearch.toLowerCase());
    });
  }, [inputSearch, projects]);

  const changeText = (e) => {
    setinputSearch(e.target.value);
  }

  const gotoaddprojects = () => {
    onChangePage('addnewproject');
  }

  const gotosettings = () => {
    vscode.postMessage({ command: 'gotosettings' });
  }

  return (
    <>
      {Boolean(projects.length) && (<div className='monishprojectapi_searchcontainer'>
        <VSCodeTextField className='monishprojectapi_searchcontainer__input' placeholder='Search Projects...' value={inputSearch} onInput={changeText}>
        </VSCodeTextField>
      </div>)}
      <ul className='monishprojectapi_projectscontainer'>
        {Boolean(projects.length) && renderProjects.map(prog => (
          <AccordionCard key={prog.id} projectdata={prog} updateOpened={updateOpened} setupdateOpened={setupdateOpened} vscode={vscode} />
        ))}
        {(Boolean(projects.length) && renderProjects.length == 0) && (
          <p style={{ marginTop: 0, textAlign: "center"}}>no results found</p>
        )}
        {projects.length === 0 && (
          <div>
            <p style={{ marginTop: 0 }}>The project list is empty. Click on the button below to start adding your projects.</p>
            <VSCodeButton appearance="primary" onClick={gotoaddprojects} className='monishprojectapi_button'>
              Go to Add Project Page
            </VSCodeButton>
            <p>If you have not set your api code. Click on the button below to add your api key.</p>
            <VSCodeButton appearance="primary" onClick={gotosettings} className='monishprojectapi_button'>
              Go to Settings Page
            </VSCodeButton>
          </div>)}
      </ul>
    </>
  )
}

function AccordionCard({ projectdata, updateOpened, setupdateOpened, vscode }) {

  const onButtonClick = (e) => {
    e.stopPropagation();
    if (Boolean(updateOpened === projectdata.id)) {
      setupdateOpened('');
    } else {
      setupdateOpened(projectdata.id);
    }
  };

  const openInEditor = (e) => {
    e.stopPropagation();
    if (!vscode) return false;

    vscode.postMessage({
      command: 'openInEditor',
      projectid: projectdata.id,
    });

  }

  const setAsFavorite = (e) => {
    e.stopPropagation();
    if (!vscode) return false;

    vscode.postMessage({
      command: 'setAsFavorite',
      projectid: projectdata.id,
    });

  }

  const unsetAsFavorite = (e) => {
    e.stopPropagation();
    if (!vscode) return false;

    vscode.postMessage({
      command: 'unsetAsFavorite',
      projectid: projectdata.id,
    });

  }

  const removeFromConfig = (e) => {
    e.stopPropagation();
    if (!vscode) return false;

    vscode.postMessage({
      command: 'removeFromConfig',
      projectid: projectdata.id,
    });

  }

  return (
    <li className='monishprojectapi_projectscontainer__card' onClick={onButtonClick}>
      <div className='monishprojectapi_projectscontainer__card__text'><span>{projectdata.favorite && (<span class="codicon codicon-heart-filled"></span>)}{projectdata.title} <br />{'(' + projectdata.path + ')'}</span>{Boolean(updateOpened === projectdata.id) ? <span class="codicon codicon-chevron-down"></span> : <span class="codicon codicon-chevron-up"></span>}</div>
      <div className='monishprojectapi_projectscontainer__card__extra' data-isopened={Boolean(updateOpened === projectdata.id)}>
        <VSCodeButton appearance="primary" onClick={openInEditor}><div class="codicon codicon-open-in-product" title='Open in Editor'></div></VSCodeButton>
        {!projectdata.favorite && (<VSCodeButton appearance="icon" onClick={setAsFavorite}><div class="codicon codicon-heart" title='Set as Favorite'></div></VSCodeButton>)}
        {projectdata.favorite && (<VSCodeButton appearance="icon" onClick={unsetAsFavorite}><div class="codicon codicon-heart-filled" title='Unset as Favorite'></div></VSCodeButton>)}
        <VSCodeButton appearance="icon" onClick={removeFromConfig}><div class="codicon codicon-trash" title='Delete from Config File'></div></VSCodeButton>
      </div>
    </li>
  )
}

export function Settingpage({ onChangePage, vscode, apidata }) {

  const [apiDataInp, setapiDataInp] = useState(apidata);

  const returnBtnClick = () => {
    onChangePage('homepage');
  };

  const changeText = (e) => {
    setapiDataInp(e.target.value);
  }

  const updateApiKey = () => {
    if (!apiDataInp.trim()) return false;
    if (!vscode) return false;

    vscode.postMessage({
      command: 'updateApiKey',
      apiString: apiDataInp.trim(),
    });
  };

  const checkKeypress = (e) => {
    if (e.key === 'Enter') {
      updateApiKey();
    }
  }

  const testApiKey = () => {
    if (!apiDataInp.trim()) return false;
    if (!vscode) return false;

    vscode.postMessage({
      command: 'testApiKey',
    });
  };


  return (
    <>
      <p>In order for this extension to work, you will need an api key from your Decipher portal. <br /><br />Once retrieved along with all necessary fetch permissions, please insert the key on the textbox below:</p>
      <div className='monishprojectapi_settingscontainer'>
        <VSCodeTextField placeholder='Add the api key here...' value={apiDataInp} onChange={changeText} onKeyUp={checkKeypress}>
        </VSCodeTextField>
        <VSCodeButton appearance='primary' onClick={updateApiKey}>
          Apply API Key
        </VSCodeButton>
        {Boolean(apiDataInp) &&
          (<VSCodeButton appearance="secondary" onClick={testApiKey}>
            Test API Key
          </VSCodeButton>)
        }
        <VSCodeButton appearance="secondary" onClick={returnBtnClick}>
          Return to Dashboard
        </VSCodeButton>
      </div>
    </>
  )
}

export function Addnewprojectpage({ onChangePage, vscode }) {
  const [inputVal, setInputVal] = useState('');

  const returnBtnClick = () => {
    setInputVal('');
    onChangePage('homepage');
  };

  const changeText = (e) => {
    setInputVal(e.target.value);
  }

  const fetchBtnClick = () => {
    if (!inputVal.trim()) return false;
    if (!vscode) return false;

    vscode.postMessage({
      command: 'fetchNewProject',
      link: inputVal,
    });
  };

  const checkKeypress = (e) => {
    if (e.key === 'Enter') {
      fetchBtnClick();
    }
  }

  return (
    <>
      <p>In order to fetch the information about your new project, please enter your project path:</p>
      <VSCodeTextField className="monishprojectapi_textfield" placeholder='selfserve/xxx/xxx/xxxxx' value={inputVal} onChange={changeText} onKeyUp={checkKeypress}>
      </VSCodeTextField>
      <div className='monishprojectapi_buttoncontainer'>
        <VSCodeButton appearance="primary" onClick={fetchBtnClick}>
          Fetch Project
        </VSCodeButton>
        <VSCodeButton appearance="secondary" onClick={returnBtnClick}>
          Return to Dashboard
        </VSCodeButton>
      </div>
    </>
  )
}