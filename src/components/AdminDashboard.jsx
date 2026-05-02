import { useEffect, useMemo, useState } from 'react'
import { normalizeMemberRow } from '../utils/permissions'

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className="adminDashToggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      {label ? <span>{label}</span> : null}
    </label>
  )
}

export default function AdminDashboard({ members: initialMembers, saving, onSave, onBack }) {
  const [members, setMembers] = useState(() =>
    Array.isArray(initialMembers) ? initialMembers.map((m) => normalizeMemberRow(m)).filter((m) => m.email) : [],
  )
  const [newEmail, setNewEmail] = useState('')
  const [newFlags, setNewFlags] = useState({ canEdit: true, canSaveFirebase: true, canDeleteHymn: false })

  useEffect(() => {
    setMembers(
      Array.isArray(initialMembers) ? initialMembers.map((m) => normalizeMemberRow(m)).filter((m) => m.email) : [],
    )
  }, [initialMembers])

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
    onSave(members.map((m) => normalizeMemberRow(m)))
  }

  return (
    <div className="adminDashboard card">
      <div className="row between adminDashboardHeader">
        <div>
          <h2>لوحة صلاحيات الفريق</h2>
          <p className="adminDashboardHint">
            الصفوف هنا تستبدل إعدادات الـ env لكل بريد مذكور. غير المذكورين يبقون على قواعد{' '}
            <code>VITE_ADMIN_EMAILS</code> وما يرتبط بها.
          </p>
        </div>
        <button type="button" className="btn" onClick={onBack}>
          العودة للتطبيق
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="adminDashboardTableWrap">
          <table className="adminDashboardTable">
            <thead>
              <tr>
                <th>البريد</th>
                <th>تعديل / محرر</th>
                <th>حفظ على السيرفر</th>
                <th>حذف ترانيم</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="adminDashboardEmpty">
                    لا صفوف بعد — أضف بريدًا من الأسفل أو استخدم القيم الافتراضية من البيئة فقط.
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
