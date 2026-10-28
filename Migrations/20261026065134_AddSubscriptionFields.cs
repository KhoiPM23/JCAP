using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JCAP.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscriptionFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CreditTransactions_UserId",
                table: "CreditTransactions");

            migrationBuilder.AddColumn<decimal>(
                name: "AmountVnd",
                table: "CreditTransactions",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "CoveredBySubscription",
                table: "CreditTransactions",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "SubscriptionPlanId",
                table: "CreditTransactions",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubscriptionPlanId",
                table: "AspNetUsers",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SubscriptionStartedAt",
                table: "AspNetUsers",
                type: "datetime2",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CreditTransactions_PayOsOrderCode",
                table: "CreditTransactions",
                column: "PayOsOrderCode");

            migrationBuilder.CreateIndex(
                name: "IX_CreditTransactions_QuotaLookup",
                table: "CreditTransactions",
                columns: new[] { "UserId", "Type", "CoveredBySubscription", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CreditTransactions_PayOsOrderCode",
                table: "CreditTransactions");

            migrationBuilder.DropIndex(
                name: "IX_CreditTransactions_QuotaLookup",
                table: "CreditTransactions");

            migrationBuilder.DropColumn(
                name: "AmountVnd",
                table: "CreditTransactions");

            migrationBuilder.DropColumn(
                name: "CoveredBySubscription",
                table: "CreditTransactions");

            migrationBuilder.DropColumn(
                name: "SubscriptionPlanId",
                table: "CreditTransactions");

            migrationBuilder.DropColumn(
                name: "SubscriptionPlanId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SubscriptionStartedAt",
                table: "AspNetUsers");

            migrationBuilder.CreateIndex(
                name: "IX_CreditTransactions_UserId",
                table: "CreditTransactions",
                column: "UserId");
        }
    }
}
