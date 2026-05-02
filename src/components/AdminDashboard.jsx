import { useEffect, useMemo, useState } from 'react'
import { hasEnvSuperAdminConfig, normalizeMemberRow } from '../utils/permissions'

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className="adminDashToggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      {label ? <span>{label}</span> : null}
    </label>
  )
}

export default function AdminDashboard({ members: initialMembers, ignoreEnvAdminList: initialIgnore, saving, onSave, onBack }) {
  const [members, setMembers] = useState(() =>
    Array.isArray(initialMembers) ? initialMembers.map((m) => normalizeMemberRow(m)).filter((m) => m.email) : [],
  )
  const [ignoreEnvAdminList, setIgnoreEnvAdminList] = useState(Boolean(initialIgnore))
  const [newEmail, setNewEmail] = useState('')
  const [newFlags, setNewFlags] = useState({
    canEdit: true,
    canSaveFirebase: true,
    canDeleteHymn: false,
    canManageDashboard: false,
  })

  useEffect(() => {
    setMembers(
      Array.isArray(initialMembers) ? initialMembers.map((m) => normalizeMemberRow(m)).filter((m) => m.email) : [],
    )
  }, [initialMembers])

  useEffect(() => {
    setIgnoreEnvAdminList(Boolean(initialIgnore))
  }, [initialIgnore])

  const sorted = useMemo(() => [...members].sort((a, b) => a.email.localeCompare(b.email)), [members])

  const updateRow = (email, patch) => {
    setMembers((prev) => prev.map((m) => (m.email === email ? { ...m, ...patch } : m)))
  }

  const removeRow = (email) => {
    setMembers((prev) => prev.filter((m) => m.email !== email))
  }

  const addMember = () => {
    const row = normalizeMemberRow({ email: newEmail, ...newFlags })
    if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      return false
    }
    if (members.some((m) => m.email === row.email)) {
      return false
    }
    setMembers((prev) => [...prev, row])
    setNewEmail('')
    return true
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (
      ignoreEnvAdminList &&
      !hasEnvSuperAdminConfig() &&
      !members.some((m) => m.canManageDashboard)
    ) {
      window.alert(
        'لا يمكن تفعيل «الاعتماد على القائمة فقط» من دون:\n' +
          '• تعريف VITE_SUPER_ADMIN_EMAILS في البيئة، أو\n' +
          '• تفعيل «لوحة المشرفين» لعضو واحد على الأقل في الجدول.',
      )
      return
    }
    onSave({
      members: members.map((m) => normalizeMemberRow(m)),
      ignoreEnvAdminList,
    })
  }

  return (
    <div className="adminDashboard card">
      <div className="row between adminDashboardHeader">
        <div>
          <h2>لوحة صلاحيات الفريق</h2>
          <p className="adminDashboardHint">
            أضف البريد كما يظهر بعد تسجيل الدخول بـ Google. عند تفعيل «الاعتماد على القائمة فقط» لن يُعتمد{' '}
            <code>VITE_ADMIN_EMAILS</code> إلا للحسابات غير الموجودة في الجدول (ستصبح قراءة فقط).
          </p>
        </div>
        <button type="button" className="btn" onClick={onBack}>
          العودة للتطبيق
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="adminDashboardPolicy">
          <label className="adminDashboardPolicyLabel">
            <input
              type="checkbox"
              checked={ignoreEnvAdminList}
              onChange={(e) => setIgnoreEnvAdminList(e.target.checked)}
            />
            <span>
              <strong>الاعتماد على القائمة فقط</strong> — تعطيل أثر قوائم الأدمن في الـ env لمن ليس في الجدول (إدارة كاملة من
              هنا بدل Netlify).
            </span>
          </label>
        </div>

        <div className="adminDashboardTableWrap">
          <table className="adminDashboardTable">
            <thead>
              <tr>
                <th>البريد</th>
                <th>محرر</th>
                <th>حفظ سيرفر</th>
                <th>حذف</th>
                <th>لوحة المشرفين</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="adminDashboardEmpty">
                    لا صفوف بعد — أضف بريدًا من الأسفل.
                  </td>
                </tr>
              ) : (
                sorted.map((m) => (
                  <tr key={m.email}>
                    <td>
                      <code className="adminDashEmail">{m.email}</code>
                    </td>
                    <td>
                      <Toggle checked={m.canEdit} onChange={(v) => updateRow(m.email, { canEdit: v })} />
                    </td>
                    <td>
                      <Toggle checked={m.canSaveFirebase} onChange={(v) => updateRow(m.email, { canSaveFirebase: v })} />
                    </td>
                    <td>
                      <Toggle checked={m.canDeleteHymn} onChange={(v) => updateRow(m.email, { canDeleteHymn: v })} />
                    </td>
                    <td>
                      <Toggle
                        checked={m.canManageDashboard}
                        onChange={(v) => updateRow(m.email, { canManageDashboard: v })}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn danger ghost" onClick={() => removeRow(m.email)}>
                        حذف الصف
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="adminDashboardAdd">
          <h3>إضافة حساب</h3>
          <div className="adminDashboardAddRow">
            <input
              className="input modernInput"
              type="email"
              placeholder="email@gmail.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              dir="ltr"
            />
            <Toggle label="محرر" checked={newFlags.canEdit} onChange={(v) => setNewFlags((p) => ({ ...p, canEdit: v }))} />
            <Toggle
              label="حفظ سيرفر"
              checked={newFlags.canSaveFirebase}
              onChange={(v) => setNewFlags((p) => ({ ...p, canSaveFirebase: v }))}
            />
            <Toggle
              label="حذف"
              checked={newFlags.canDeleteHymn}
              onChange={(v) => setNewFlags((p) => ({ ...p, canDeleteHymn: v }))}
            />
            <Toggle
              label="لوحة"
              checked={newFlags.canManageDashboard}
              onChange={(v) => setNewFlags((p) => ({ ...p, canManageDashboard: v }))}
            />
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (!addMember()) {
                  window.alert('تحقق من البريد أو أن الحساب غير مضاف مسبقًا.')
                }
              }}
            >
              إضافة
            </button>
          </div>
        </div>

        <div className="row end adminDashboardFooter">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
          </button>
        </div>
      </form>
    </div>
  )
}
