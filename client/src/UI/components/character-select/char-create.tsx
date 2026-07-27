import React, { useCallback, useEffect, useMemo, useState } from 'react';
import GameManager from '@game/Manager/game-manager';
import {
  defaultEltaniaCharacterDraft,
  eltaniaCharacterContract,
  isValidEltaniaCharacterName,
  projectEltaniaCharacterToLegacyTransport,
} from '@game/Content/eltania-character-contract';
import { CharCreate, Int } from '@game/Net/messages';
import { OpCodes } from '@game/Net/opcodes';
import Player from '@game/Player/player';
import { VIEWS } from '../../../Game/Constants/constants';
import { WorldSocket } from '../../net/instances';
import {
  RequiemButton,
  RequiemPanel,
  RequiemStatus,
} from '../../requiem/primitives';

type CharacterCreateProps = {
  setView: (view: number) => void;
};

const nameStarts = ['Ael', 'Bren', 'Cor', 'Dae', 'El', 'Fen', 'Ily', 'Kael', 'Mara', 'Or'];
const nameEnds = ['dan', 'en', 'eth', 'ian', 'is', 'ora', 'ren', 'ric', 'ryn', 'va'];

function generatedEltaniaName(): string {
  const start = nameStarts[Math.floor(Math.random() * nameStarts.length)]!;
  const end = nameEnds[Math.floor(Math.random() * nameEnds.length)]!;
  return `${start}${end}`.slice(0, 15);
}

export const CharacterCreate: React.FC<CharacterCreateProps> = ({ setView }) => {
  const [draft, setDraft] = useState(defaultEltaniaCharacterDraft);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const bodyFamily = eltaniaCharacterContract.bodyFamilies[0];
  const calling = eltaniaCharacterContract.callings[0];
  const origin = eltaniaCharacterContract.origins[0];
  const validName = isValidEltaniaCharacterName(draft.name);

  const transportCharacter = useMemo(
    () => projectEltaniaCharacterToLegacyTransport(draft),
    [draft],
  );

  useEffect(() => {
    const preview = {
      ...transportCharacter,
      inventoryItems: [],
      equip         : [],
      equipment     : {},
    };
    GameManager.instance?.CharacterSelect?.loadModel(preview, true, () => {
      Player.instance?.UpdateNameplate([draft.name || 'Wayfarer']);
    });
  }, [draft.name, transportCharacter]);

  useEffect(() => {
    Player.instance?.UpdateNameplate([draft.name || 'Wayfarer']);
  }, [draft.name]);

  const setBody = useCallback((bodyComponentId: string, presentationId: string) => {
    setDraft((current) => ({
      ...current,
      bodyComponentId,
      presentationId,
    }));
  }, []);

  const createCharacter = useCallback(() => {
    if (!validName || submitting) {
      return;
    }
    setSubmitting(true);
    setMessage('Creating character…');
    WorldSocket.registerOpCodeHandler(OpCodes.ApproveName_Server, Int, (data) => {
      setSubmitting(false);
      if (data.value === 1) {
        setView(VIEWS.CHAR_SELECT);
      } else {
        setMessage('That identity could not be created. Choose another name.');
      }
    });
    void WorldSocket.sendMessage(
      OpCodes.CharacterCreate,
      CharCreate,
      transportCharacter,
    );
  }, [setView, submitting, transportCharacter, validName]);

  return (
    <div className="rq-character-create">
      <RequiemPanel
        className="rq-character-create__composition"
        eyebrow="Elrador // Appearance"
        title="Create a character"
      >
        <div className="rq-character-create__section">
          <div className="rq-character-create__heading">
            <span>Body family</span>
            <strong>{bodyFamily.label}</strong>
          </div>
          <div className="rq-character-create__choices">
            {bodyFamily.components.map((component) => (
              <button
                aria-pressed={draft.bodyComponentId === component.id}
                className="rq-character-create__choice"
                key={component.id}
                type="button"
                onClick={() => setBody(component.id, component.presentationId)}
              >
                {component.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="rq-character-create__section"
          onBlur={() => {
            if (GameManager.instance?.CharacterSelect) {
              GameManager.instance.CharacterSelect.faceCam = false;
            }
          }}
          onFocus={() => {
            if (GameManager.instance?.CharacterSelect) {
              GameManager.instance.CharacterSelect.faceCam = true;
            }
          }}
        >
          <div className="rq-character-create__heading">
            <span>Face component</span>
            <strong>Compatible set</strong>
          </div>
          <div className="rq-character-create__choices rq-character-create__choices--faces">
            {bodyFamily.faces.map((face) => (
              <button
                aria-pressed={draft.faceComponentId === face.id}
                className="rq-character-create__choice"
                key={face.id}
                type="button"
                onClick={() => {
                  setDraft((current) => ({
                    ...current,
                    faceComponentId: face.id,
                  }));
                }}
              >
                {face.label}
              </button>
            ))}
          </div>
        </div>

        <RequiemButton
          className="rq-character-create__back"
          variant="quiet"
          onClick={() => setView(VIEWS.CHAR_SELECT)}
        >
          Back to roster
        </RequiemButton>
      </RequiemPanel>

      <RequiemPanel
        className="rq-character-create__identity"
        eyebrow="Elrador // Identity"
        title="Character"
      >
        <div className="rq-character-create__adapter">
          <RequiemStatus tone="development">{origin.status}</RequiemStatus>
        </div>

        <label className="rq-character-create__name">
          <span>Wayfarer name</span>
          <span>
            <input
              autoComplete="off"
              maxLength={15}
              placeholder="Four to fifteen letters"
              value={draft.name}
              onChange={(event) => {
                const value = event.target.value.replace(/[^A-Za-z]/g, '');
                const normalized = value
                  ? value[0]!.toUpperCase() + value.slice(1).toLowerCase()
                  : '';
                setDraft((current) => ({ ...current, name: normalized }));
              }}
              onKeyDown={(event) => event.stopPropagation()}
            />
            <RequiemButton
              variant="quiet"
              onClick={() => {
                setDraft((current) => ({
                  ...current,
                  name: generatedEltaniaName(),
                }));
              }}
            >
              Suggest
            </RequiemButton>
          </span>
          {draft.name && !validName ? (
            <small>Use 4–15 letters, beginning with a capital.</small>
          ) : null}
        </label>

        <dl className="rq-character-create__summary">
          <div>
            <dt>Calling</dt>
            <dd>{calling.label}</dd>
          </div>
          <div>
            <dt>Origin</dt>
            <dd>{origin.label}</dd>
          </div>
          <div>
            <dt>Appearance</dt>
            <dd>
              {bodyFamily.components.find(
                (component) => component.id === draft.bodyComponentId,
              )?.label}
              {' // '}
              {bodyFamily.faces.find((face) => face.id === draft.faceComponentId)?.label}
            </dd>
          </div>
        </dl>

        {message ? <p className="rq-character-create__message">{message}</p> : null}
        <RequiemButton
          disabled={!validName || submitting}
          variant="primary"
          onClick={createCharacter}
        >
          {submitting ? 'Creating…' : 'Create character'}
        </RequiemButton>
      </RequiemPanel>
    </div>
  );
};
