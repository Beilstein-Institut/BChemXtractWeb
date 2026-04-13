"""Pydantic models for extracted chemical data.

All fields are guaranteed non-null by the DTO coercion layer (D-09).
Downstream code never needs to check for None.
"""

from pydantic import BaseModel, Field


class SubstanceResponse(BaseModel):
    """Extracted chemical substance with all fields guaranteed non-null."""

    inchi: str = ""
    inchi_key: str = ""
    smiles: str = ""
    extended_smiles: str = ""
    iupac_name: str = ""
    molecular_formula: str = ""
    aux_info: str = ""
    mdlv3000: str = ""
    abbreviations: dict[str, str] = Field(default_factory=dict)


class ReactionComponentResponse(BaseModel):
    """A component (reactant/product/agent) of a reaction."""

    inchi: str = ""
    inchi_key: str = ""
    cdx_top: float = 0.0
    cdx_left: float = 0.0
    cdx_bottom: float = 0.0
    cdx_right: float = 0.0


class ReactionResponse(BaseModel):
    """Extracted chemical reaction with all fields guaranteed non-null."""

    rinchi: str = ""
    rinchi_key: str = ""
    short_rinchi_key: str = ""
    long_rinchi_key: str = ""
    web_rinchi_key: str = ""
    reaction_smiles: str = ""
    aux_info: str = ""
    reactants: list[ReactionComponentResponse] = Field(default_factory=list)
    products: list[ReactionComponentResponse] = Field(default_factory=list)
    agents: list[ReactionComponentResponse] = Field(default_factory=list)


class SubstanceInfoResponse(BaseModel):
    """Extraction statistics from BCXSubstanceInfo."""

    no_fragments: int = 0
    no_inchis: int = 0
    no_substances: int = 0
