using Microsoft.AspNetCore.Mvc;

namespace JCAP.Properties._111
{
    public class HomeController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}
