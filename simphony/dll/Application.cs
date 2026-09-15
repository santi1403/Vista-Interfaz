using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using Micros.Ops;
using Micros.Ops.Extensibility;
using Micros.PosCore.Extensibility;

namespace GestionClientes
{
    /// <summary>
    /// Puente Simphony → app web de clientes.
    /// EMC Name: GestionClientes
    /// Sim Inquire: GestionClientes:asignarCliente
    /// DLL: Type=DLL;AppName=GestionClientes;FileName=GestionClientes.dll;Function=asignarCliente
    /// </summary>
    public class Application : OpsExtensibilityApplication
    {
        public Application(IExecutionContext context)
            : base(context)
        {
        }

        [ExtensibilityMethod]
        public void asignarCliente()
        {
            AbrirApp(null);
        }

        void AbrirApp(object args)
        {
            string checkId = LeerCheckPrincipal();
            if (string.IsNullOrEmpty(checkId))
            {
                OpsContext.ShowMessage("Abra una cuenta (check) antes de asignar cliente.");
                return;
            }

            string baseUrl = UrlBase(args);
            string url = UrlApp(baseUrl, checkId);
            if (!AbrirDialogoHtml(url, checkId))
                AbrirNavegador(url);
        }

        bool AbrirDialogoHtml(string url, string checkId)
        {
            try
            {
                Type parmType = Type.GetType("Micros.PosCore.Extensibility.UserInterface.ExtensibilityInPlaceHtmlDialogParameters, PosCore", false);
                MethodInfo show = OpsContext.GetType().GetMethod("ShowExtensibilityHtmlDialog");
                if (parmType == null || show == null)
                    return false;

                object parms = Activator.CreateInstance(parmType);
                SetProp(parms, "HTML", HtmlEnvoltorio(url));
                SetProp(parms, "Argument", checkId);
                SetProp(parms, "Sender", "AsignarCliente");
                SetProp(parms, "ShowCloseButton", true);
                show.Invoke(OpsContext, new object[] { parms });
                return true;
            }
            catch
            {
                return false;
            }
        }

        static void SetProp(object obj, string name, object value)
        {
            PropertyInfo p = obj.GetType().GetProperty(name);
            if (p != null && p.CanWrite)
                p.SetValue(obj, value, null);
        }

        void AbrirNavegador(string url)
        {
            string[] chromes = {
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
            };
            try
            {
                foreach (string exe in chromes)
                {
                    if (File.Exists(exe))
                    {
                        Process.Start(exe, "--app=\"" + url + "\" --window-size=1366,800");
                        return;
                    }
                }
                Process.Start(url);
            }
            catch (Exception ex)
            {
                OpsContext.ShowMessage("Abra la app de clientes:\n" + url + "\n" + ex.Message);
            }
        }

        string LeerCheckPrincipal()
        {
            string formatted = Safe(delegate {
                return Convert.ToString(OpsContext.CheckNumberText);
            });
            if (EsCheck(formatted))
                return formatted.Trim();

            string number = Safe(delegate {
                return Convert.ToString(OpsContext.CheckNumber);
            });
            if (EsCheck(number))
                return number.Trim();

            try
            {
                var chk = OpsContext.Check;
                if (chk != null)
                {
                    string n = Convert.ToString(chk.CheckNumber);
                    if (EsCheck(n))
                        return n.Trim();
                }
            }
            catch
            {
            }

            return "";
        }

        string LeerCheckNum()
        {
            return Safe(delegate {
                return Convert.ToString(OpsContext.CheckNumber);
            });
        }

        string LeerEmpleado()
        {
            string emp = Safe(delegate {
                return Convert.ToString(OpsContext.TransEmployeeNumber);
            });
            if (!string.IsNullOrEmpty(emp) && emp != "0")
                return emp.Trim();
            emp = Safe(delegate {
                return Convert.ToString(OpsContext.TransEmployeeID);
            });
            if (!string.IsNullOrEmpty(emp) && emp != "0")
                return emp.Trim();
            return "";
        }

        string UrlBase(object args)
        {
            string fromArg = ExtraerUrl(args);
            if (!string.IsNullOrEmpty(fromArg))
                return fromArg.TrimEnd('/');

            try
            {
                string dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                string f = Path.Combine(dir ?? "", "url.txt");
                if (File.Exists(f))
                {
                    string u = File.ReadAllText(f).Trim();
                    if (u.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                        return u.TrimEnd('/');
                }
            }
            catch
            {
            }

            return "http://127.0.0.1:8000";
        }

        string ExtraerUrl(object args)
        {
            if (args == null)
                return "";
            string s = Convert.ToString(args);
            if (s != null && s.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                return s.Trim();
            return "";
        }

        string UrlApp(string baseUrl, string checkId)
        {
            string q = "pos=1&check=" + Uri.EscapeDataString(checkId);
            string num = LeerCheckNum();
            if (EsCheck(num) && !string.Equals(num.Trim(), checkId, StringComparison.OrdinalIgnoreCase))
                q += "&check_num=" + Uri.EscapeDataString(num.Trim());
            string emp = LeerEmpleado();
            if (!string.IsNullOrEmpty(emp))
                q += "&emp=" + Uri.EscapeDataString(emp);
            return baseUrl + "/index.html?" + q;
        }

        static string HtmlEnvoltorio(string url)
        {
            string src = (url ?? "").Replace("&", "&amp;").Replace("\"", "&quot;");
            return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>"
                + "<style>html,body{margin:0;height:100%;background:#0f172a;overflow:hidden}"
                + "iframe{border:0;width:100%;height:100%;display:block}</style></head><body>"
                + "<iframe src=\"" + src + "\"></iframe>"
                + "<script>window.addEventListener('message',function(ev){var d=ev.data||{};"
                + "if(d.tipo==='pegarCliente'||d.tipo==='cerrarClientes'){"
                + "try{if(window.SimphonyPOSAPI)SimphonyPOSAPI.closeDialog(JSON.stringify(d));}catch(e){}"
                + "}});</script></body></html>";
        }

        static bool EsCheck(string v)
        {
            if (string.IsNullOrWhiteSpace(v))
                return false;
            v = v.Trim();
            return v != "0" && v != "False";
        }

        static string Safe(Func<string> fn)
        {
            try
            {
                return fn() ?? "";
            }
            catch
            {
                return "";
            }
        }
    }

    public class ApplicationFactory : IExtensibilityAssemblyFactory
    {
        public ExtensibilityAssemblyBase Create(IExecutionContext context)
        {
            return new Application(context);
        }

        public void Destroy(ExtensibilityAssemblyBase app)
        {
            app.Destroy();
        }
    }
}
