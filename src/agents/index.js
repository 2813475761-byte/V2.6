'use strict';

const growth = require('./growth');
const resume = require('./resume');
const interview = require('./interview');

const AGENTS = {
  growth,
  resume,
  interview
};

function getAgent(name) {
  return AGENTS[name] || null;
}

function listAgents() {
  return Object.values(AGENTS).map((agent) => ({
    name: agent.name,
    title: agent.title,
    description: agent.description
  }));
}

module.exports = { AGENTS, getAgent, listAgents };