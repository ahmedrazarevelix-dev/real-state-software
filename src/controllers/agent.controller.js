const asyncHandler = require("../middlewares/asyncHandler.middleware");
const ApiResponse = require("../utils/ApiResponse");
const agentService = require("../services/agent.service");

const BASE = "/api/v1/agents";

const agentRequestHandler = (app) => {
    app.get(
        BASE,
        asyncHandler(async (req, res) => {
            const agents = await agentService.listAgents();
            return res.status(200).json(new ApiResponse(200, agents, "Agents fetched successfully"));
        })
    );

    app.get(
        `${BASE}/:id`,
        asyncHandler(async (req, res) => {
            const agent = await agentService.getAgentById(req.params.id);
            return res.status(200).json(new ApiResponse(200, agent, "Agent profile fetched"));
        })
    );
};

module.exports = agentRequestHandler;
