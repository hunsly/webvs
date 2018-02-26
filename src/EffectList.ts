/**
 * Copyright (c) 2013-2015 Azeem Arshad
 * See the file license.txt for copying permission.
 */
import Container from './Container';
import IMain from './IMain';
import Component from './Component';
import FrameBufferManager from './webgl/FrameBufferManager';
import CodeInstance from './expr/CodeInstance';
import { BlendModes } from './utils';
import compileExpr from './expr/compileExpr';

export enum ELBlendModes {
    REPLACE = 1,
    MAXIMUM,
    AVERAGE,
    ADDITIVE,
    SUBTRACTIVE1,
    SUBTRACTIVE2,
    MULTIPLY,
    MULTIPLY2,
    ADJUSTABLE,
    ALPHA,
    IGNORE
}

export interface EffectListOpts {
    code: {
        init: string,
        perFrame: string
    };
    output: string,
    input: string,
    clearFrame: boolean,
    enableOnBeat: boolean,
    enableOnBeatFor: number
}

// Effectlist is a container that renders components to a separate buffer. and blends
// it in with the parent buffer. Its also used as the root component in Webvs.Main
export default class EffectList extends Container {
    static componentName = "EffectList";
    static componentTag = "";
    protected static defaultOptions: EffectListOpts = {
        code: {
            init: "",
            perFrame: ""
        },
        output: "REPLACE",
        input: "IGNORE",
        clearFrame: false,
        enableOnBeat: false,
        enableOnBeatFor: 1
    }
    protected static optUpdateHandlers = {
        code: "updateCode",
        output: "updateBlendMode",
        input: "updateBlendMode"
    }

    protected opts: EffectListOpts;
    private frameCounter: number;
    private first: boolean;
    private inited: boolean = false;
    private code: CodeInstance;
    private input: ELBlendModes;
    private output: ELBlendModes;

    constructor(main: IMain, parent: Container, opts: any) {
        super(main, parent, opts);
    }

    init() {
        super.init();
        this.fm = new FrameBufferManager(this.main.rctx, this.main.copier, this.parent?true:false);
        this.updateCode();
        this.updateBlendMode(this.opts.input, "input");
        this.updateBlendMode(this.opts.output, "output");
        this.frameCounter = 0;
        this.first = true;
        this.listenTo(this.main, "resize", this.handleResize);
    }

    draw() {
        const opts = this.opts;

        if(opts.enableOnBeat) {
            if(this.main.analyser.beat) {
                this.frameCounter = opts.enableOnBeatFor;
            } else if(this.frameCounter > 0) {
                this.frameCounter--;
            }

            // only enable for enableOnBeatFor # of frames
            if(this.frameCounter === 0) {
                return;
            }
        }

        this.code['beat'] = this.main.analyser.beat?1:0;
        this.code['enabled'] = 1;
        this.code['clear'] = opts.clearFrame;
        if(!this.inited) {
            this.inited = true;
            this.code['init']();
        }
        this.code['perFrame']();
        if(this.code['enabled'] === 0) {
            return;
        }

        // set rendertarget to internal framebuffer
        this.fm.setRenderTarget();

        // clear frame
        if(opts.clearFrame || this.first || this.code['clear']) {
            const gl = this.main.rctx.gl;
            gl.clearColor(0,0,0,1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            this.first = false;
        }

        // blend input texture onto internal texture
        if(this.input !== ELBlendModes.IGNORE) {
            const inputTexture = this.parent.fm.getCurrentTexture();
            //const blendMode: BlendModes = this.input as number;
            this.main.copier.run(this.fm, this.input as number, inputTexture);
        }

        // render all the components
        for(let i = 0;i < this.components.length;i++) {
            if(this.components[i].enabled) {
                this.components[i].draw();
            }
        }

        // switch to old framebuffer
        this.fm.restoreRenderTarget();

        // blend current texture to the output framebuffer
        if(this.output != ELBlendModes.IGNORE) {
            if(this.parent) {
                this.main.copier.run(this.parent.fm, this.output as number, this.fm.getCurrentTexture());
            } else {
                this.main.copier.run(null, null, this.fm.getCurrentTexture());
            }
        }
    }

    destroy() {
        super.destroy();
        if(this.fm) {
            // destroy the framebuffer manager
            this.fm.destroy();
        }
    }

    private updateCode() {
        this.code = compileExpr(this.opts.code, ["init", "perFrame"]).codeInst;
        this.code.setup(this.main);
        this.inited = false;
    }

    private updateBlendMode(value: string, name: "input" | "output") {
        if(name === "input") {
            this.input = ELBlendModes[value];
        } else {
            this.output = ELBlendModes[value];
        }
    }

    private handleResize() {
        this.fm.resize();
        this.code.updateDimVars(this.main.rctx.gl);
    }
}