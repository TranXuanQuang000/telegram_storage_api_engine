tasks:
  - task_id: FE_01
    agent: FE
    description: "Build The Curator's Canvas (React Flow), Cyber-Nexus Monitor, and The Verified Journal UI"
    inputs: ["UI_DIRECTION.md", "shared_memory/design-tokens.json", "shared_memory/api-contract.yaml"]
    outputs: ["/frontend/src/components/*"]
    deps: []
  
  - task_id: BE_01
    agent: BE
    description: "Build 4-Layer Consent Verification and Record Linkage Pipeline"
    inputs: ["System_Design.md", "shared_memory/api-contract.yaml"]
    outputs: ["/backend/src/pipelines/*", "/backend/src/routes/*"]
    deps: []
    
  - task_id: BE_02
    agent: BE
    description: "Implement API Gateway, Circuit Breakers, and Resiliency Logic"
    inputs: ["System_Design.md"]
    outputs: ["/backend/src/services/*"]
    deps: ["BE_01"]
