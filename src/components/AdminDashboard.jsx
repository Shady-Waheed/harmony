import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import {
  hasEnvSuperAdminConfig,
  normalizeMemberRow,
} from "../utils/permissions";
import {
  buildMemberLookupRequest,
  isDuplicateMember,
} from "../utils/teamMemberLookup";

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className="adminDashToggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export default function AdminDashboard({
  members: initialMembers,
  ignoreEnvAdminList: initialIgnore,
  saving,
  onSave,
  onBack,
}) {
  const [members, setMembers] = useState(() =>
    Array.isArray(initialMembers)
      ? initialMembers.map((m) => normalizeMemberRow(m)).filter((m) => m.email)
      : [],
  );
  const [ignoreEnvAdminList, setIgnoreEnvAdminList] = useState(
    Boolean(initialIgnore),
  );
  const [newEmail, setNewEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [resolvedUser, setResolvedUser] = useState(null);
  const [newFlags, setNewFlags] = useState({
    canEdit: true,
    canSaveFirebase: true,
    canDeleteHymn: false,
    canManageDashboard: false,
    canManageSetlists: false,
  });

  useEffect(() => {
    setMembers(
      Array.isArray(initialMembers)
        ? initialMembers
            .map((m) => normalizeMemberRow(m))
            .filter((m) => m.email)
        : [],
    );
  }, [initialMembers]);

  useEffect(() => {
    setIgnoreEnvAdminList(Boolean(initialIgnore));
  }, [initialIgnore]);

  const sorted = useMemo(
    () => [...members].sort((a, b) => a.email.localeCompare(b.email)),
    [members],
  );

  const updateRow = (email, patch) => {
    setMembers((prev) =>
      prev.map((m) => (m.email === email ? { ...m, ...patch } : m)),
    );
  };

  const removeRow = (email) => {
    setMembers((prev) => prev.filter((m) => m.email !== email));
  };

  const findFirebaseUser = async () => {
    const email = String(newEmail || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLookupError("يرجى إدخال بريد إلكتروني صالح.");
      setResolvedUser(null);
      return;
    }

    if (!functions) {
      setLookupError("خدمة البحث عن المستخدمين غير متاحة في هذا الموقع.");
      setResolvedUser(null);
      return;
    }

    setLookupLoading(true);
    setLookupError("");
    setResolvedUser(null);

    try {
      const callable = httpsCallable(functions, "resolveTeamMemberByEmail");
      const result = await callable(buildMemberLookupRequest({ email }));
      const data = result?.data || {};

      if (data.status === "MATCHED" && data.user) {
        setResolvedUser(data.user);
        return;
      }

      if (data.status === "UNMATCHED") {
        setLookupError("لا يوجد حساب Firebase مطابق لهذا البريد.");
        return;
      }

      if (data.status === "AMBIGUOUS") {
        const candidates = Array.isArray(data.candidates)
          ? data.candidates
          : [];
        const details = candidates.length
          ? ` حسابات متعددة: ${candidates.map((item) => item.email || item.uid).join(", ")}`
          : "";
        setLookupError(
          `يوجد أكثر من حساب Firebase مطابق لهذا البريد.${details}`,
        );
        return;
      }

      setLookupError("تعذر تأكيد هوية هذا المستخدم بشكل آمن.");
    } catch (error) {
      const message = error?.message || "Failed to resolve user.";
      if (String(message).includes("permission-denied")) {
        setLookupError("أنت غير مصرح لك بإدارة أعضاء الفريق.");
      } else if (String(message).includes("unauthenticated")) {
        setLookupError("يجب تسجيل الدخول أولًا لإدارة الفريق.");
      } else {
        setLookupError("تعذر العثور على هذا المستخدم في Firebase Auth.");
      }
    } finally {
      setLookupLoading(false);
    }
  };

  const addMember = () => {
    const email = String((resolvedUser?.email || newEmail || "").trim());
    const uid = String(resolvedUser?.uid || "");
    const row = normalizeMemberRow({
      uid,
      email,
      displayName: resolvedUser?.displayName || "",
      ...newFlags,
    });

    if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      setLookupError("يرجى التأكد من صحة البريد قبل إضافته.");
      return false;
    }

    if (!uid) {
      setLookupError("يجب العثور على حساب Firebase أولًا قبل إضافة العضو.");
      return false;
    }

    if (isDuplicateMember(members, row)) {
      setLookupError("هذا المستخدم موجود بالفعل في قائمة الفريق.");
      return false;
    }

    setMembers((prev) => [...prev, row]);
    setResolvedUser(null);
    setLookupError("");
    setNewEmail("");
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (
      ignoreEnvAdminList &&
      !hasEnvSuperAdminConfig() &&
      !members.some((m) => m.canManageDashboard)
    ) {
      window.alert(
        "لا يمكن تفعيل «الاعتماد على القائمة فقط» من دون:\n" +
          "• تعريف VITE_SUPER_ADMIN_EMAILS في البيئة، أو\n" +
          "• تفعيل «لوحة المشرفين» لعضو واحد على الأقل في الجدول.",
      );
      return;
    }
    onSave({
      members: members.map((m) => normalizeMemberRow(m)),
      ignoreEnvAdminList,
    });
  };

  return (
    <div className="adminDashboard card">
      <div className="row between adminDashboardHeader">
        <div>
          <h2>لوحة صلاحيات الفريق</h2>
          <p className="adminDashboardHint">
            أضف البريد كما يظهر بعد تسجيل الدخول بـ Google. سيبحث النظام عنه عبر
            Firebase Auth ثم يضيفه باستخدام UID الآمن.
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
              <strong>الاعتماد على القائمة فقط</strong> — تعطيل أثر قوائم الأدمن
              في الـ env لمن ليس في الجدول (إدارة كاملة من هنا بدل Netlify).
            </span>
          </label>
        </div>

        <div className="adminDashboardTableWrap">
          <table className="adminDashboardTable">
            <thead>
              <tr>
                <th>البريد</th>
                <th>UID</th>
                <th>محرر</th>
                <th>حفظ سيرفر</th>
                <th>حذف</th>
                <th>لوحة المشرفين</th>
                <th>قوائم الخدمة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="adminDashboardEmpty">
                    لا صفوف بعد — أضف بريدًا من الأسفل.
                  </td>
                </tr>
              ) : (
                sorted.map((m) => (
                  <tr key={m.uid || m.email}>
                    <td>
                      <code className="adminDashEmail">{m.email}</code>
                    </td>
                    <td>
                      <code className="adminDashEmail">{m.uid || "—"}</code>
                    </td>
                    <td>
                      <Toggle
                        checked={m.canEdit}
                        onChange={(v) => updateRow(m.email, { canEdit: v })}
                      />
                    </td>
                    <td>
                      <Toggle
                        checked={m.canSaveFirebase}
                        onChange={(v) =>
                          updateRow(m.email, { canSaveFirebase: v })
                        }
                      />
                    </td>
                    <td>
                      <Toggle
                        checked={m.canDeleteHymn}
                        onChange={(v) =>
                          updateRow(m.email, { canDeleteHymn: v })
                        }
                      />
                    </td>
                    <td>
                      <Toggle
                        checked={m.canManageDashboard}
                        onChange={(v) =>
                          updateRow(m.email, { canManageDashboard: v })
                        }
                      />
                    </td>
                    <td>
                      <Toggle
                        checked={m.canManageSetlists}
                        onChange={(v) =>
                          updateRow(m.email, { canManageSetlists: v })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn danger ghost"
                        onClick={() => removeRow(m.email)}
                      >
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
              onChange={(e) => {
                setNewEmail(e.target.value);
                if (resolvedUser) {
                  setResolvedUser(null);
                }
                if (lookupError) {
                  setLookupError("");
                }
              }}
              dir="ltr"
            />
            <button
              type="button"
              className="btn"
              onClick={findFirebaseUser}
              disabled={lookupLoading}
            >
              {lookupLoading ? "جارٍ البحث..." : "بحث عن مستخدم Firebase"}
            </button>
          </div>

          {lookupError ? (
            <div className="adminDashboardLookupError">{lookupError}</div>
          ) : null}

          {resolvedUser ? (
            <div className="adminDashboardLookupPreview">
              <h4>تم العثور على المستخدم</h4>
              <div>Email: {resolvedUser.email || newEmail}</div>
              <div>Name: {resolvedUser.displayName || "—"}</div>
              <div>UID: {resolvedUser.uid || "—"}</div>
              <div>Verified: {resolvedUser.emailVerified ? "yes" : "no"}</div>
              <div>Disabled: {resolvedUser.disabled ? "yes" : "no"}</div>
            </div>
          ) : null}

          <div className="adminDashboardPermissionsRow">
            <Toggle
              label="محرر"
              checked={newFlags.canEdit}
              onChange={(v) => setNewFlags((p) => ({ ...p, canEdit: v }))}
            />
            <Toggle
              label="حفظ سيرفر"
              checked={newFlags.canSaveFirebase}
              onChange={(v) =>
                setNewFlags((p) => ({ ...p, canSaveFirebase: v }))
              }
            />
            <Toggle
              label="حذف"
              checked={newFlags.canDeleteHymn}
              onChange={(v) => setNewFlags((p) => ({ ...p, canDeleteHymn: v }))}
            />
            <Toggle
              label="لوحة"
              checked={newFlags.canManageDashboard}
              onChange={(v) =>
                setNewFlags((p) => ({ ...p, canManageDashboard: v }))
              }
            />
            <Toggle
              label="قوائم"
              checked={newFlags.canManageSetlists}
              onChange={(v) =>
                setNewFlags((p) => ({ ...p, canManageSetlists: v }))
              }
            />
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (!addMember()) {
                  window.alert(
                    "يجب البحث عن المستخدم أولًا ثم التأكيد على إضافة العضو.",
                  );
                }
              }}
            >
              إضافة عضو
            </button>
          </div>
        </div>

        <div className="row end adminDashboardFooter">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ الصلاحيات"}
          </button>
        </div>
      </form>
    </div>
  );
}
