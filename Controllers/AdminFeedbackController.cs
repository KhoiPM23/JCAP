using System.Threading;
using System.Threading.Tasks;
using JCAP.Data.Static;
using JCAP.DTOs.Feedback;
using JCAP.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JCAP.Controllers
{
    [ApiController]
    [Route("api/admin/feedback")]
    [Authorize(Roles = UserRoles.Admin)]
    public class AdminFeedbackController : ControllerBase
    {
        private readonly IFeedbackService _feedbackService;

        public AdminFeedbackController(IFeedbackService feedbackService)
        {
            _feedbackService = feedbackService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllTickets(CancellationToken cancellationToken)
        {
            var response = await _feedbackService.GetAllTicketsForAdminAsync(cancellationToken);
            return response.Success ? Ok(response) : BadRequest(response);
        }

        [HttpPost("{id:int}/seen")]
        public async Task<IActionResult> MarkSeen(int id, CancellationToken cancellationToken)
        {
            var response = await _feedbackService.MarkTicketSeenByAdminAsync(id, cancellationToken);
            return response.Success ? Ok(response) : NotFound(response);
        }

        [HttpPost("{id:int}/reply")]
        public async Task<IActionResult> ReplyTicket(
            int id,
            [FromBody] ReplyFeedbackTicketDto dto,
            CancellationToken cancellationToken)
        {
            var response = await _feedbackService.ReplyAsAdminAsync(id, dto, cancellationToken);
            return response.Success ? Ok(response) : BadRequest(response);
        }

        [HttpPost("{id:int}/close")]
        public async Task<IActionResult> CloseTicket(int id, CancellationToken cancellationToken)
        {
            var response = await _feedbackService.CloseTicketAsAdminAsync(id, cancellationToken);
            return response.Success ? Ok(response) : BadRequest(response);
        }

        [HttpPost("{id:int}/reopen")]
        public async Task<IActionResult> ReopenTicket(int id, CancellationToken cancellationToken)
        {
            var response = await _feedbackService.ReopenTicketAsAdminAsync(id, cancellationToken);
            return response.Success ? Ok(response) : BadRequest(response);
        }
    }
}

