import { useRef, useState } from 'react'
import HymnEditor from './components/HymnEditor'
import HymnView from './components/HymnView'
import { HymnProvider, useHymnStore } from './store/hymnStore.jsx'
import { exportNodeToPng } from './utils/exportImage'
import {
  downloadProjectFile,
  parseProjectFileContent,
  PROJECT_EXTENSION,
  readTextFile,
} from './utils/projectFile'

function AppShell() {
  const { state, setMode, toggleTheme, importProject, resetProject } = useHymnStore()
  const [loadingExport, setLoadingExport] = useState(false)
  const viewRef = useRef(null)
  const projectFileInputRef = useRef(null)

  const isDark = state.theme === 'dark'

  const onExport = async () => {
    if (!viewRef.current) return
    try {
      setLoadingExport(true)
      await exportNodeToPng(viewRef.current, `${state.hymn.title || 'harmony-notes'}.png`, isDark)
    } catch (error) {
      alert(`فشل التصدير: ${error.message}`)
    } finally {
      setLoadingExport(false)
    }
  }

  const onSaveProjectFile = () => {
    try {
      downloadProjectFile(state)
    } catch (error) {
      alert(`فشل حفظ الملف: ${error.message}`)
    }
  }

  const onOpenProjectClick = () => {
    projectFileInputRef.current?.click()
  }

  const onImportProjectFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const content = await readTextFile(file)
      const project = parseProjectFileContent(content)
      importProject(project)
      alert('تم استيراد المشروع بنجاح')
    } catch (error) {
      alert(`فشل استيراد الملف: ${error.message}`)
    } finally {
      event.target.value = ''
    }
  }

  const onResetProject = () => {
    const confirmed = window.confirm('هل تريد البدء من الأول؟ سيتم مسح كل التعديلات الحالية.')
    if (!confirmed) return
    resetProject()
  }

  return (
    <div className={`app ${state.theme}`} dir="rtl" lang="ar">
      <header className="topBar">
        <div>
          <h1>Harmony Notes</h1>
          <p>محرر ترانيم احترافي لكتابة الكوردات وعرضها</p>
        </div>

        <div className="row wrap">
          <button className={`btn ${state.mode === 'edit' ? 'primary' : ''}`} onClick={() => setMode('edit')}>
            وضع التعديل
          </button>
          <button className={`btn ${state.mode === 'view' ? 'primary' : ''}`} onClick={() => setMode('view')}>
            وضع العرض
          </button>
          <button className="btn" onClick={toggleTheme}>
            {isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
          </button>
          <button className="btn" onClick={onSaveProjectFile}>
            حفظ ملف المشروع
          </button>
          <button className="btn" onClick={onOpenProjectClick}>
            استيراد ملف المشروع
          </button>
          <button className="btn" onClick={onExport} disabled={loadingExport}>
            {loadingExport ? 'جاري التصدير...' : 'تصدير PNG (HD)'}
          </button>
          <input
            ref={projectFileInputRef}
            type="file"
            accept={`${PROJECT_EXTENSION},application/json`}
            onChange={onImportProjectFile}
            hidden
          />
        </div>
      </header>

      <main className="content">
        {state.mode === 'edit' ? <HymnEditor /> : <HymnView ref={viewRef} />}
      </main>

      {state.mode === 'edit' ? (
        <section className="previewWrap">
          <h3>معاينة مباشرة</h3>
          <HymnView ref={viewRef} />
        </section>
      ) : null}

      <button className="floatingResetBtn" onClick={onResetProject}>
        ابدأ من الأول
      </button>
    </div>
  )
}

function App() {
  return (
    <HymnProvider>
      <AppShell />
    </HymnProvider>
  )
}

export default App
